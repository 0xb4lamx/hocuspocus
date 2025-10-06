import { createHmac } from 'crypto';
import { TiptapTransformer } from '@hocuspocus/transformer';
import axios from 'axios';
import { Forbidden } from '@hocuspocus/common';

var Events;
(function (Events) {
    Events["onChange"] = "change";
    Events["onConnect"] = "connect";
    Events["onCreate"] = "create";
    Events["onDisconnect"] = "disconnect";
})(Events || (Events = {}));
class Webhook {
    /**
     * Constructor
     */
    constructor(configuration) {
        this.configuration = {
            debounce: 2000,
            debounceMaxWait: 10000,
            secret: "",
            transformer: TiptapTransformer,
            url: "",
            events: [Events.onChange],
        };
        this.debounced = new Map();
        this.configuration = {
            ...this.configuration,
            ...configuration,
        };
        if (!this.configuration.url) {
            throw new Error("url is required!");
        }
    }
    /**
     * Create a signature for the response body
     */
    createSignature(body) {
        const hmac = createHmac("sha256", this.configuration.secret);
        return `sha256=${hmac.update(body).digest("hex")}`;
    }
    /**
     * debounce the given function, using the given identifier
     */
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    debounce(id, func) {
        const old = this.debounced.get(id);
        const start = (old === null || old === void 0 ? void 0 : old.start) || Date.now();
        const run = () => {
            this.debounced.delete(id);
            func();
        };
        if (old === null || old === void 0 ? void 0 : old.timeout)
            clearTimeout(old.timeout);
        if (Date.now() - start >= this.configuration.debounceMaxWait)
            return run();
        this.debounced.set(id, {
            start,
            timeout: setTimeout(run, this.configuration.debounce),
        });
    }
    /**
     * Send a request to the given url containing the given data
     */
    async sendRequest(event, payload) {
        const json = JSON.stringify({ event, payload });
        return axios.post(this.configuration.url, json, {
            headers: {
                "X-Hocuspocus-Signature-256": this.createSignature(json),
                "Content-Type": "application/json",
            },
        });
    }
    /**
     * onChange hook
     */
    async onChange(data) {
        if (!this.configuration.events.includes(Events.onChange)) {
            return;
        }
        const save = async () => {
            try {
                await this.sendRequest(Events.onChange, {
                    document: this.configuration.transformer.fromYdoc(data.document),
                    documentName: data.documentName,
                    context: data.context,
                    requestHeaders: data.requestHeaders,
                    requestParameters: Object.fromEntries(data.requestParameters.entries()),
                });
            }
            catch (e) {
                console.error(`Caught error in extension-webhook: ${e}`);
            }
        };
        if (!this.configuration.debounce) {
            return save();
        }
        this.debounce(data.documentName, save);
    }
    /**
     * onLoadDocument hook
     */
    async onLoadDocument(data) {
        if (!this.configuration.events.includes(Events.onCreate)) {
            return;
        }
        try {
            const response = await this.sendRequest(Events.onCreate, {
                documentName: data.documentName,
                requestHeaders: data.requestHeaders,
                requestParameters: Object.fromEntries(data.requestParameters.entries()),
            });
            if (response.status !== 200 || !response.data)
                return;
            const document = typeof response.data === "string"
                ? JSON.parse(response.data)
                : response.data;
            // eslint-disable-next-line guard-for-in,no-restricted-syntax
            for (const fieldName in document) {
                if (data.document.isEmpty(fieldName)) {
                    data.document.merge(this.configuration.transformer.toYdoc(document[fieldName], fieldName));
                }
            }
        }
        catch (e) {
            console.error(`Caught error in extension-webhook: ${e}`);
        }
    }
    /**
     * onConnect hook
     */
    async onConnect(data) {
        if (!this.configuration.events.includes(Events.onConnect)) {
            return;
        }
        try {
            const response = await this.sendRequest(Events.onConnect, {
                documentName: data.documentName,
                requestHeaders: data.requestHeaders,
                requestParameters: Object.fromEntries(data.requestParameters.entries()),
            });
            return typeof response.data === "string" && response.data.length > 0
                ? JSON.parse(response.data)
                : response.data;
        }
        catch (e) {
            console.error(`Caught error in extension-webhook: ${e}`);
            throw Forbidden;
        }
    }
    async onDisconnect(data) {
        if (!this.configuration.events.includes(Events.onDisconnect)) {
            return;
        }
        try {
            await this.sendRequest(Events.onDisconnect, {
                documentName: data.documentName,
                requestHeaders: data.requestHeaders,
                requestParameters: Object.fromEntries(data.requestParameters.entries()),
                context: data.context,
            });
        }
        catch (e) {
            console.error(`Caught error in extension-webhook: ${e}`);
        }
    }
}

export { Events, Webhook };
//# sourceMappingURL=hocuspocus-webhook.esm.js.map
