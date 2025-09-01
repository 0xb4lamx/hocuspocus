'use strict';

var server = require('@hocuspocus/server');
var redlock = require('@sesamecare-oss/redlock');
var RedisClient = require('ioredis');
var uuid = require('uuid');

class Redis {
    constructor(configuration) {
        /**
         * Make sure to give that extension a higher priority, so
         * the `onStoreDocument` hook is able to intercept the chain,
         * before documents are stored to the database.
         */
        this.priority = 1000;
        this.configuration = {
            port: 6379,
            host: "127.0.0.1",
            prefix: "hocuspocus",
            identifier: `host-${uuid.v4()}`,
            lockTimeout: 1000,
            disconnectDelay: 1000,
        };
        this.redisTransactionOrigin = "__hocuspocus__redis__origin__";
        this.locks = new Map();
        /**
         * When we have a high frequency of updates to a document we don't need tons of setTimeouts
         * piling up, so we'll track them to keep it to the most recent per document.
         */
        this.pendingDisconnects = new Map();
        this.pendingAfterStoreDocumentResolves = new Map();
        /**
         * Handle incoming messages published on subscribed document channels.
         * Note that this will also include messages from ourselves as it is not possible
         * in Redis to filter these.
         */
        this.handleIncomingMessage = async (channel, data) => {
            const [identifier, messageBuffer] = this.decodeMessage(data);
            if (identifier === this.configuration.identifier) {
                return;
            }
            const message = new server.IncomingMessage(messageBuffer);
            const documentName = message.readVarString();
            message.writeVarString(documentName);
            const document = this.instance.documents.get(documentName);
            if (!document) {
                return;
            }
            new server.MessageReceiver(message, this.redisTransactionOrigin).apply(document, undefined, (reply) => {
                return this.pub.publish(this.pubKey(document.name), this.encodeMessage(reply));
            });
        };
        /**
         * Make sure to *not* listen for further changes, when there’s
         * no one connected anymore.
         */
        this.onDisconnect = async ({ documentName }) => {
            const pending = this.pendingDisconnects.get(documentName);
            if (pending) {
                clearTimeout(pending);
                this.pendingDisconnects.delete(documentName);
            }
            const disconnect = () => {
                const document = this.instance.documents.get(documentName);
                this.pendingDisconnects.delete(documentName);
                // Do nothing, when other users are still connected to the document.
                if (document && document.getConnectionsCount() > 0) {
                    return;
                }
                // Time to end the subscription on the document channel.
                this.sub.unsubscribe(this.subKey(documentName), (error) => {
                    if (error) {
                        console.error(error);
                    }
                });
                if (document) {
                    this.instance.unloadDocument(document);
                }
            };
            // Delay the disconnect procedure to allow last minute syncs to happen
            const timeout = setTimeout(disconnect, this.configuration.disconnectDelay);
            this.pendingDisconnects.set(documentName, timeout);
        };
        this.configuration = {
            ...this.configuration,
            ...configuration,
        };
        // Create Redis instance
        const { port, host, options, nodes, redis, createClient } = this.configuration;
        if (typeof createClient === "function") {
            this.pub = createClient();
            this.sub = createClient();
        }
        else if (redis) {
            this.pub = redis.duplicate();
            this.sub = redis.duplicate();
        }
        else if (nodes && nodes.length > 0) {
            this.pub = new RedisClient.Cluster(nodes, options);
            this.sub = new RedisClient.Cluster(nodes, options);
        }
        else {
            this.pub = new RedisClient(port, host, options !== null && options !== void 0 ? options : {});
            this.sub = new RedisClient(port, host, options !== null && options !== void 0 ? options : {});
        }
        this.sub.on("messageBuffer", this.handleIncomingMessage);
        this.redlock = new redlock.Redlock([this.pub], {
            retryCount: 0,
        });
        const identifierBuffer = Buffer.from(this.configuration.identifier, "utf-8");
        this.messagePrefix = Buffer.concat([
            Buffer.from([identifierBuffer.length]),
            identifierBuffer,
        ]);
    }
    async onConfigure({ instance }) {
        this.instance = instance;
    }
    getKey(documentName) {
        return `${this.configuration.prefix}:${documentName}`;
    }
    pubKey(documentName) {
        return this.getKey(documentName);
    }
    subKey(documentName) {
        return this.getKey(documentName);
    }
    lockKey(documentName) {
        return `${this.getKey(documentName)}:lock`;
    }
    encodeMessage(message) {
        return Buffer.concat([this.messagePrefix, Buffer.from(message)]);
    }
    decodeMessage(buffer) {
        const identifierLength = buffer[0];
        const identifier = buffer.toString("utf-8", 1, identifierLength + 1);
        return [identifier, buffer.slice(identifierLength + 1)];
    }
    /**
     * Once a document is loaded, subscribe to the channel in Redis.
     */
    async afterLoadDocument({ documentName, document, }) {
        return new Promise((resolve, reject) => {
            // On document creation the node will connect to pub and sub channels
            // for the document.
            this.sub.subscribe(this.subKey(documentName), async (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                this.publishFirstSyncStep(documentName, document);
                this.requestAwarenessFromOtherInstances(documentName);
                resolve(undefined);
            });
        });
    }
    /**
     * Publish the first sync step through Redis.
     */
    async publishFirstSyncStep(documentName, document) {
        const syncMessage = new server.OutgoingMessage(documentName)
            .createSyncMessage()
            .writeFirstSyncStepFor(document);
        return this.pub.publish(this.pubKey(documentName), this.encodeMessage(syncMessage.toUint8Array()));
    }
    /**
     * Let’s ask Redis who is connected already.
     */
    async requestAwarenessFromOtherInstances(documentName) {
        const awarenessMessage = new server.OutgoingMessage(documentName).writeQueryAwareness();
        return this.pub.publish(this.pubKey(documentName), this.encodeMessage(awarenessMessage.toUint8Array()));
    }
    /**
     * Before the document is stored, make sure to set a lock in Redis.
     * That’s meant to avoid conflicts with other instances trying to store the document.
     */
    async onStoreDocument({ documentName }) {
        // Attempt to acquire a lock and read lastReceivedTimestamp from Redis,
        // to avoid conflict with other instances storing the same document.
        const resource = this.lockKey(documentName);
        const ttl = this.configuration.lockTimeout;
        try {
            await this.redlock.acquire([resource], ttl);
            const oldLock = this.locks.get(resource);
            if (oldLock) {
                await oldLock.release;
            }
        }
        catch (error) {
            //based on: https://github.com/sesamecare/redlock/blob/508e00dcd1e4d2bc6373ce455f4fe847e98a9aab/src/index.ts#L347-L349
            if (error == 'ExecutionError: The operation was unable to achieve a quorum during its retry window.') {
                // Expected behavior: Could not acquire lock, another instance locked it already.
                // No further `onStoreDocument` hooks will be executed; should throw a silent error with no message.
                throw new Error('', { cause: 'Could not acquire lock, another instance locked it already.' });
            }
            //unexpected error
            console.error("unexpected error:", error);
            throw error;
        }
    }
    /**
     * Release the Redis lock, so other instances can store documents.
     */
    async afterStoreDocument({ documentName, socketId }) {
        const lockKey = this.lockKey(documentName);
        const lock = this.locks.get(lockKey);
        if (lock) {
            try {
                // Always try to unlock and clean up the lock
                lock.release = lock.lock.release();
                await lock.release;
            }
            catch {
                // Lock will expire on its own after timeout
            }
            finally {
                this.locks.delete(lockKey);
            }
        }
        // if the change was initiated by a directConnection, we need to delay this hook to make sure sync can finish first.
        // for provider connections, this usually happens in the onDisconnect hook
        if (socketId === "server") {
            const pending = this.pendingAfterStoreDocumentResolves.get(documentName);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve();
                this.pendingAfterStoreDocumentResolves.delete(documentName);
            }
            let resolveFunction = () => { };
            const delayedPromise = new Promise((resolve) => {
                resolveFunction = resolve;
            });
            const timeout = setTimeout(() => {
                this.pendingAfterStoreDocumentResolves.delete(documentName);
                resolveFunction();
            }, this.configuration.disconnectDelay);
            this.pendingAfterStoreDocumentResolves.set(documentName, {
                timeout,
                resolve: resolveFunction,
            });
            await delayedPromise;
        }
    }
    /**
     * Handle awareness update messages received directly by this Hocuspocus instance.
     */
    async onAwarenessUpdate({ documentName, awareness, added, updated, removed, }) {
        const changedClients = added.concat(updated, removed);
        const message = new server.OutgoingMessage(documentName).createAwarenessUpdateMessage(awareness, changedClients);
        return this.pub.publish(this.pubKey(documentName), this.encodeMessage(message.toUint8Array()));
    }
    /**
     * if the ydoc changed, we'll need to inform other Hocuspocus servers about it.
     */
    async onChange(data) {
        if (data.transactionOrigin !== this.redisTransactionOrigin) {
            return this.publishFirstSyncStep(data.documentName, data.document);
        }
    }
    async beforeBroadcastStateless(data) {
        const message = new server.OutgoingMessage(data.documentName).writeBroadcastStateless(data.payload);
        return this.pub.publish(this.pubKey(data.documentName), this.encodeMessage(message.toUint8Array()));
    }
    /**
     * Kill the Redlock connection immediately.
     */
    async onDestroy() {
        await this.redlock.quit();
        this.pub.disconnect(false);
        this.sub.disconnect(false);
    }
}

exports.Redis = Redis;
//# sourceMappingURL=hocuspocus-redis.cjs.map
