class Throttle {
    /**
     * Constructor
     */
    constructor(configuration) {
        this.configuration = {
            throttle: 15,
            banTime: 5,
            consideredSeconds: 60,
            cleanupInterval: 90,
        };
        this.connectionsByIp = new Map();
        this.bannedIps = new Map();
        this.configuration = {
            ...this.configuration,
            ...configuration,
        };
        this.cleanupInterval = setInterval(this.clearMaps.bind(this), this.configuration.cleanupInterval * 1000);
    }
    onDestroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        return Promise.resolve();
    }
    clearMaps() {
        this.connectionsByIp.forEach((value, key) => {
            const filteredValue = value.filter((timestamp) => timestamp + this.configuration.consideredSeconds * 1000 > Date.now());
            if (filteredValue.length) {
                this.connectionsByIp.set(key, filteredValue);
            }
            else {
                this.connectionsByIp.delete(key);
            }
        });
        this.bannedIps.forEach((value, key) => {
            if (!this.isBanned(key)) {
                this.bannedIps.delete(key);
            }
        });
    }
    isBanned(ip) {
        const bannedAt = this.bannedIps.get(ip) || 0;
        return Date.now() < bannedAt + this.configuration.banTime * 60 * 1000;
    }
    /**
     * Throttle requests
     * @private
     */
    throttle(ip) {
        if (!this.configuration.throttle) {
            return false;
        }
        if (this.isBanned(ip))
            return true;
        this.bannedIps.delete(ip);
        // add this connection try to the list of previous connections
        const previousConnections = this.connectionsByIp.get(ip) || [];
        previousConnections.push(Date.now());
        // calculate the previous connections in the last considered time interval
        const previousConnectionsInTheConsideredInterval = previousConnections.filter((timestamp) => timestamp + this.configuration.consideredSeconds * 1000 > Date.now());
        this.connectionsByIp.set(ip, previousConnectionsInTheConsideredInterval);
        if (previousConnectionsInTheConsideredInterval.length >
            this.configuration.throttle) {
            this.bannedIps.set(ip, Date.now());
            return true;
        }
        return false;
    }
    /**
     * onConnect hook
     * @param data
     */
    onConnect(data) {
        const { request } = data;
        // get the remote ip address
        const ip = request.headers["x-real-ip"] ||
            request.headers["x-forwarded-for"] ||
            request.socket.remoteAddress ||
            "";
        // throttle the connection
        return this.throttle(ip) ? Promise.reject() : Promise.resolve();
    }
}

export { Throttle };
//# sourceMappingURL=hocuspocus-throttle.esm.js.map
