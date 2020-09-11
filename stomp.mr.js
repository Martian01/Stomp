/*
	Stomp Over WebSocket http://www.jmesnil.net/stomp-websocket/doc/ | Apache License V2.0

	Copyright (C) 2010-2013 [Jeff Mesnil](http://jmesnil.net/)
	Copyright (C) 2012 [FuseSource, Inc.](http://fusesource.com)
	Copyright (C) 2017 [Deepak Kumar](https://www.kreatio.com)
	Copyright (C) 2020 [Martin Rogge](https://github.com/Martian01)

	Documentation and download at https://github.com/Martian01/Stomp

 */

(function(root) {

	var Stomp;

	let Frame = (function() {

		function Frame(command, headers, body, escapeHeaderValues) {
			this.command = command || '';
			this.headers = headers || {};
			this.body = body || '';
			this.escapeHeaderValues = !!escapeHeaderValues;
		}

		let _trim = function(str) {
			return str.replace(/^\s+|\s+$/g, '');
		};

		let _escape = function(command, escapeHeaderValues, value) {
			return escapeHeaderValues && command !== 'CONNECT' && command !== 'CONNECTED' ? Frame.frEscape(value) : value;
		};

		let _unescape = function(command, escapeHeaderValues, value) {
			return escapeHeaderValues && command !== 'CONNECT' && command !== 'CONNECTED' ? Frame.frUnEscape(value) : value;
		};

		Frame.prototype.toString = function() {
			let lines = [this.command];
			let skipContentLength = this.headers['content-length'] === false;
			if (skipContentLength)
				delete this.headers['content-length'];
			let headers = this.headers;
			for (let name in headers)
				if ({}.hasOwnProperty.call(headers, name))
					lines.push(name + ":" + _escape(this.command, this.escapeHeaderValues, value = headers[name]));
			if (this.body && !skipContentLength)
				lines.push("content-length:" + (Frame.sizeOfUTF8(this.body)));
			lines.push('\x0A' + this.body);
			return lines.join('\x0A');
		};

		let unmarshallSingle = function(data, escapeHeaderValues) {
			let divider = data.search(RegExp("" + '\x0A' + '\x0A'));
			let headerLines = data.substring(0, divider).split('\x0A');
			let command = headerLines.shift();
			let headers = {};
			let ref = headerLines.reverse();
			for (let j = 0; j < ref.length; j++) {
				let line = ref[j];
				let idx = line.indexOf(':');
				headers[_trim(line.substring(0, idx))] = _unescape(command, escapeHeaderValues, _trim(line.substring(idx + 1)));
			}
			let  body = '';
			let start = divider + 2;
			if (headers['content-length']) {
				let len = parseInt(headers['content-length']);
				body = ('' + data).substring(start, start + len);
			} else {
				for (let i = start; start <= data.length ? i < data.length : i > data.length; start <= data.length ? ++i : --i) {
					let chr = data.charAt(i);
					if (chr === '\x00')
						break;
					body += chr;
				}
			}
			return new Frame(command, headers, body, escapeHeaderValues);
		};

		Frame.unmarshall = function(datas, escapeHeaderValues) {
			let frames = datas.split(RegExp("" + '\x00' + '\x0A' + "*"));
			let r = {
				frames: [],
				partial: ''
			};
			r.frames = [];
			let ref = frames.slice(0, -1);
			for (let j = 0; j < ref.length; j++) {
				let frame = ref[j];
				r.frames.push(unmarshallSingle(frame, escapeHeaderValues));
			}
			let last_frame = frames.slice(-1)[0];
			if (last_frame === '\x0A' || (last_frame.search(RegExp("" + '\x00' + '\x0A' + "*$"))) !== -1)
				r.frames.push(unmarshallSingle(last_frame, escapeHeaderValues));
			else
				r.partial = last_frame;
			return r;
		};

		Frame.marshall = function(command, headers, body, escapeHeaderValues) {
			let frame = new Frame(command, headers, body, escapeHeaderValues);
			return frame.toString() + '\x00';
		};

		Frame.sizeOfUTF8 = function(s) {
			return s ? encodeURI(s).match(/%..|./g).length : 0;
		};

		Frame.frEscape = function(str) {
			return ("" + str).replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/:/g, "\\c");
		};

		Frame.frUnEscape = function(str) {
			return ("" + str).replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\c/g, ":").replace(/\\\\/g, "\\");
		};

		return Frame;

	})();

	let Client = (function() {

		function Client(wsFactory) {
			this.wsFactory = function() {
				let ws = wsFactory();
				ws.binaryType = "arraybuffer";
				return ws;
			};
			this.reconnect_delay = 0;
			this.counter = 0;
			this.connected = false;
			this.heartbeat = {
				outgoing: 10000,
				incoming: 10000
			};
			this.maxWebSocketFrameSize = 16 * 1024;
			this.subscriptions = {};
			this.partialData = '';
		}

		let _now = function() {
			return Date.now ? Date.now() : new Date().valueOf;
		};

		let _UTF8ArrayToStr = function(array) {
			let out = "";
			let len = array.length;
			let i = 0;
			while (i < len) {
				let char2, char3;
				let c = array[i++];
				switch (c >> 4) {
					case 0:
					case 1:
					case 2:
					case 3:
					case 4:
					case 5:
					case 6:
					case 7:
						out += String.fromCharCode(c);
						break;
					case 12:
					case 13:
						char2 = array[i++];
						out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
						break;
					case 14:
						char2 = array[i++];
						char3 = array[i++];
						out += String.fromCharCode(((c & 0x0F) << 12) | ((char2 & 0x3F) << 6) | ((char3 & 0x3F) << 0));
				}
			}
			return out;
		};

		Client.prototype.debug = function(message) {
			window && window.console && window.console.log(message);
		};

		Client.prototype._transmit = function(command, headers, body) {
			let out = Frame.marshall(command, headers, body, this.escapeHeaderValues);
			this.debug(">>> " + out);
			while (true) {
				if (out.length > this.maxWebSocketFrameSize) {
					this.ws.send(out.substring(0, this.maxWebSocketFrameSize));
					out = out.substring(this.maxWebSocketFrameSize);
					this.debug("remaining = " + out.length);
				} else {
					this.ws.send(out);
					return;
				}
			}
		};

		Client.prototype._setupHeartbeat = function(headers) {
			if (headers.version === Stomp.VERSIONS.V1_1 || headers.version === Stomp.VERSIONS.V1_2) {
				let values = headers['heart-beat'].split(",");
				if (values.length >= 2)  {
					let serverOutgoing = parseInt(values[0]);
					let serverIncoming = parseInt(values[1]);
					if (!(this.heartbeat.outgoing === 0 || serverIncoming === 0)) {
						let ttl = Math.max(this.heartbeat.outgoing, serverIncoming);
						this.debug("send PING every " + ttl + "ms");
						this.pinger = Stomp.setInterval(ttl, function() {
							this.ws.send('\x0A');
							this.debug(">>> PING");
						}.bind(this));
					}
					if (!(this.heartbeat.incoming === 0 || serverOutgoing === 0)) {
						let ttl = Math.max(this.heartbeat.incoming, serverOutgoing);
						this.debug("check PONG every " + ttl + "ms");
						this.ponger = Stomp.setInterval(ttl, function() {
							let delta = _now() - this.serverActivity;
							if (delta > ttl * 2) {
								this.debug("did not receive server activity for the last " + delta + "ms");
								this.ws.close();
							}
						}.bind(this));
					}
				}
			}
		};

		Client.prototype._parseConnect = function() {
			let args = 1 <= arguments.length ? [].slice.call(arguments, 0) : [];
			let headers = {};
			let closeEventCallback, connectCallback, errorCallback;
			if (args.length < 2)
				throw "Connect requires at least 2 arguments";
			if (typeof args[1] === 'function') {
				headers = args[0];
				connectCallback = args[1];
				if (args.length > 2) errorCallback = args[2];
				if (args.length > 3) closeEventCallback = args[3];
			} else {
				headers.login = args[0];
				headers.passcode = args[1];
				if (args.length > 2) connectCallback = args[2];
				if (args.length > 3) errorCallback = args[3];
				if (args.length > 4) closeEventCallback = args[4];
				if (args.length > 5) headers.host = args[5];
			}
			return [headers, connectCallback, errorCallback, closeEventCallback];
		};

		Client.prototype.connect = function() {
			let args = 1 <= arguments.length ? [].slice.call(arguments, 0) : [];
			this.escapeHeaderValues = false;
			let out = this._parseConnect.apply(this, args);
			this.headers = out[0], this.connectCallback = out[1], this.errorCallback = out[2], this.closeEventCallback = out[3];
			this._active = true;
			this._connect();
		};

		Client.prototype._connect = function() {
			let headers = this.headers;
			let errorCallback = this.errorCallback;
			let closeEventCallback = this.closeEventCallback;
			if (!this._active) {
				this.debug('Client has been marked inactive, will not attempt to connect');
				return;
			}
			this.debug("Opening Web Socket...");
			this.ws = this.wsFactory();
			if (this.ws.readyState !== 0) {
				this.debug('Web socket not in state 0, will not attempt to connect');
				return;
			}
			this.ws.onmessage = function(evt) {
				let data = evt && evt.data;
				if (!data) {
					this.debug("--- empty message, ignored");
					return;
				}
				if (typeof ArrayBuffer !== 'undefined' && evt.data instanceof ArrayBuffer) {
					let arr = new Uint8Array(data);
					this.debug("--- got data of length: " + arr.length);
					data = _UTF8ArrayToStr(arr);
				}
				this.serverActivity = _now();
				if (data === '\x0A') {
					this.debug("<<< PONG");
					return;
				}
				this.debug("<<< " + data);
				let unmarshalledData = Frame.unmarshall(this.partialData + data, this.escapeHeaderValues);
				this.partialData = unmarshalledData.partial;
				let frames = unmarshalledData.frames;
				for (let j = 0; j < frames.length; j++) {
					let frame = frames[j];
					switch (frame.command) {
						case "CONNECTED":
							this.debug("connected to server " + frame.headers.server);
							this.connected = true;
							this.version = frame.headers.version;
							if (this.version === Stomp.VERSIONS.V1_2)
								this.escapeHeaderValues = true;
							if (!this._active) {
								this.disconnect();
								return;
							}
							this._setupHeartbeat(frame.headers);
							if (typeof this.connectCallback === "function")
								this.connectCallback(frame);
							break;
						case "MESSAGE":
							let subscription = frame.headers.subscription;
							let onreceive = this.subscriptions[subscription] || this.onreceive;
							if (onreceive) {
								let client = this;
								let messageID = frame.headers[this.version === Stomp.VERSIONS.V1_2 ? "ack" : "message-id"];
								frame.ack = function(headers) {
									client.ack(messageID, subscription, headers || {});
								};
								frame.nack = function(headers) {
									client.nack(messageID, subscription, headers || {});
								};
								onreceive(frame);
							} else
								this.debug("Unhandled received MESSAGE: " + frame);
							break;
						case "RECEIPT":
							if (frame.headers["receipt-id"] === this.closeReceipt) {
								this.ws.onclose = null;
								this.ws.close();
								this._cleanUp();
								if (typeof this._disconnectCallback === "function")
									this._disconnectCallback();
							} else {
								if (typeof this.onreceipt === "function")
									this.onreceipt(frame);
							}
							break;
						case "ERROR":
							if (typeof errorCallback === "function")
								errorCallback(frame);
							break;
						default:
							this.debug("Unhandled frame: " + frame);
					}
				}
			}.bind(this);
			this.ws.onclose = function(closeEvent) {
				let msg = "Whoops! Lost connection to " + this.ws.url;
				this.debug(msg);
				if (typeof closeEventCallback === "function")
					closeEventCallback(closeEvent);
				this._cleanUp();
				if (typeof errorCallback === "function")
					errorCallback(msg);
				this._schedule_reconnect();
			}.bind(this);
			this.ws.onopen = function() {
				this.debug('Web Socket Opened...');
				headers["accept-version"] = Stomp.VERSIONS.supportedVersions();
				headers["heart-beat"] = [this.heartbeat.outgoing, this.heartbeat.incoming].join(',');
				this._transmit("CONNECT", headers);
			}.bind(this);
		};

		Client.prototype._schedule_reconnect = function() {
			if (this.reconnect_delay > 0) {
				this.debug("STOMP: scheduling reconnection in " + this.reconnect_delay + "ms");
				this._reconnector = setTimeout(function() {
					if (this.connected) {
						this.debug('STOMP: already connected');
					} else {
						this.debug('STOMP: attempting to reconnect');
						this._connect();
					}
				}.bind(this), this.reconnect_delay);
			}
		};

		Client.prototype.disconnect = function(disconnectCallback, headers) {
			if (!headers)
				headers = {};
			this._disconnectCallback = disconnectCallback;
			this._active = false;
			if (this.connected) {
				if (!headers.receipt)
					headers.receipt = "close-" + this.counter++;
				this.closeReceipt = headers.receipt;
				try {
					this._transmit("DISCONNECT", headers);
				} catch (error) {
					this.debug('Ignoring error during disconnect', error);
				}
			}
		};

		Client.prototype._cleanUp = function() {
			if (this._reconnector)
				clearTimeout(this._reconnector);
			this.connected = false;
			this.subscriptions = {};
			this.partial = '';
			if (this.pinger)
				Stomp.clearInterval(this.pinger);
			if (this.ponger)
				Stomp.clearInterval(this.ponger);
		};

		Client.prototype.send = function(destination, headers, body) {
			if (!headers)
				headers = {};
			if (!body)
				body = '';
			headers.destination = destination;
			this._transmit("SEND", headers, body);
		};

		Client.prototype.subscribe = function(destination, callback, headers) {
			if (!headers)
				headers = {};
			if (!headers.id)
				headers.id = "sub-" + this.counter++;
			headers.destination = destination;
			this.subscriptions[headers.id] = callback;
			this._transmit("SUBSCRIBE", headers);
			let client = this;
			return {
				id: headers.id,
				unsubscribe: function(hdrs) {
					return client.unsubscribe(headers.id, hdrs);
				}
			};
		};

		Client.prototype.unsubscribe = function(id, headers) {
			if (!headers)
				headers = {};
			delete this.subscriptions[id];
			headers.id = id;
			this._transmit("UNSUBSCRIBE", headers);
		};

		Client.prototype.begin = function(transaction_id) {
			let txid = transaction_id || "tx-" + this.counter++;
			this._transmit("BEGIN", {
				transaction: txid
			});
			let client = this;
			return {
				id: txid,
				commit: function() {
					client.commit(txid);
				},
				abort: function() {
					client.abort(txid);
				}
			};
		};

		Client.prototype.commit = function(transaction_id) {
			this._transmit("COMMIT", {
				transaction: transaction_id
			});
		};

		Client.prototype.abort = function(transaction_id) {
			this._transmit("ABORT", {
				transaction: transaction_id
			});
		};

		Client.prototype.ack = function(messageID, subscription, headers) {
			if (!headers)
				headers = {};
			headers[this.version === Stomp.VERSIONS.V1_2 ? "id" : "message-id"] = messageID;
			headers.subscription = subscription;
			this._transmit("ACK", headers);
		};

		Client.prototype.nack = function(messageID, subscription, headers) {
			if (!headers)
				headers = {};
			headers[this.version === Stomp.VERSIONS.V1_2 ? "id" : "message-id"] = messageID;
			headers.subscription = subscription;
			this._transmit("NACK", headers);
		};

		return Client;

	})();

	Stomp = {
		VERSIONS: {
			V1_0: '1.0',
			V1_1: '1.1',
			V1_2: '1.2',
			supportedVersions: function() {
				return '1.2,1.1,1.0';
			}
		},
		clientFromUrl: function(url, protocols) {
			if (typeof url === "string") {
				let wsFactory = function() {
					return new WebSocket(url, protocols || ['v10.stomp', 'v11.stomp', 'v12.stomp']);
				};
				return new Client(wsFactory);
			}
		},
		clientFromFactory: function(wsFactory) {
			if (typeof wsFactory === "function")
				return new Client(wsFactory);
		},
/*		clientFromWebSocket: function(ws) {
			if (ws) {
				let wsFactory = function() {
					return ws;
				};
				return new Client(wsFactory);
			}
		},
*/
		Frame: Frame
	};

	Stomp.setInterval = function(interval, f) {
		return setInterval(f, interval);
	};

	Stomp.clearInterval = function(id) {
		return clearInterval(id);
	};

	root.Stomp = Stomp;

})(this);
