# What is STOMP

STOMP is a messaging protocol. The acronym expands to Simple (or Streaming) Text Oriented Message Protocol. There is a brief article on [Wikipedia](https://en.wikipedia.org/wiki/Streaming_Text_Oriented_Messaging_Protocol).

# What is Stomp.js

Stomp.js is a Javascript library offering the STOMP protocol to Javascript software running in a web browser, as well as other environments. Stomp.js was originally developed by Jeff Mesnil in [this repository](https://github.com/stomp-js/stomp-websocket). Since then the library has been forked and is further developed [here](https://github.com/stomp-js/stompjs/blob/develop/Contribute.md).

# What is Stomp.mr.js

Stomp.mr.js was born out of a simple bug fix, and out of the requirement for a plugin for the gaming platform Cocos2d, or Cocos Creator as it is called nowadays. In a way, this approach took Stomp.js back to its roots of being a simple Javascript library for the web browser without unnecessary global side effects.

At the same time, some of the artifacts of the Javascript generation from CoffeScript have been removed. The code is now lean hand-written Javascript, although it still very much follows the original code.

# Why not as a contribution to Stomp.js

It is a different philosophy. The base project celebrates an orgy in Javascript, employing CoffeScript, TypeScript, node.js, npm, Jasmine, Karma, webpack. It builds global side effects into the library to support all sorts of Javascript frameworks. It intends to support all sorts of middleware, like RabbitMQ.

# Why Javascript

Because Javascript is the only language running in a web browser.

Software engineers and computer scientists across the world should unite to avoid using Javascript for any other purpose. Javascript rolls back 50 years of progress in computer science, producing buggy, unmaintainable bags of poorly written software. Anyone who spent hours and days on production issues *for errors that could have been caught in the text editor* will agree. As will anyone who loses hours on numerous build-deployment cycles, or anyone who has to maintain a piece of script that is either poorly written, or a deeply nested mess of function calls that return and apply functions, for the simple purpose of reducing variable scope.

Our modern world of post-factualism even brings the blessings of "web technologies" to the desktop, via software platforms like electron. Now our desktop applications are becoming as flaky and rough as our web applications.

# Why an incompatible API change

This was done for two reasons. For once, as we all know, naming things is on of the [two hardest problems in computer science](https://www.martinfowler.com/bliki/TwoHardThings.html). So we took the opportunity to name the API functions more appropriately.

Secondly, it has turned out that one conceptual problem with the library was the implicit re-use of web sockets, if you followed the majority of online tutorials. In order to force people to think, and to seek out this documentation, it was decided to invalidate the previous calls. 

# Usage

For a web application, simply import the script in your root html document, like so:

	<script src="/path/to/stomp.mr.js"></script>

There are no global side effects built into the code. If you need to include the library into some Javascript framework using global mechanisms like `require`, `module` or `exports`, you need to add that yourself.

Afterwards you can use the global property `Stomp` in your code. `Stomp` essentially has one purpose: to give you a client object, that has exactly the same API as previous versions of Stomp.js. What has changed is how to obtain the client object. There are two options:

1. You can obtain a client for a particular URL. Typically the URL is of the format *ws://host/endpoint*. Internally, `Stomp` will use the standard `WebSocket` API to create web sockets on your behalf as needed. Your code would be `Stomp.clientFromUrl(urlString)`. In former Stomp.js versions it used to be `Stomp.client(urlString)`.

2. You can obtain a client for a given web socket factory. Your code would be `Stomp.clientFromFactory(webSocketFactory)`. This option was available in one of the last Stomp.js versions under `Stomp.over(webSocketFactory)`.

3. In former Stomp.js versions there was a third option. You could obtain a client for a single web socket. This is heavily discouraged as it may lead to issues with the lifecycle of a web socket unless you know what you are doing. You can enable this function by commenting in the code at the end of the library, enabling the call  `Stomp.clientFromWebSocket(webSocket)`. In former Stomp.js versions it used to be `Stomp.over(webSocket)`.

### The Happy Path

	let wsClient = Stomp.over(webSocketFactory);
	wsClient.reconnect_delay = 5000;
	...
	wsClient.connect(headers, connectCallback, errorCallback);
	...
	wsClient.send(destination, headers, body);
	...
	wsClient.disconnect(disconnectCallback);

	function connectCallback() {
		wsClient.subscribe('/topic/log', subscriptionCallback);
		...
	}

Note the use of `reconnect_delay` to enable automatic reconnection after losing the connection, or after the last attempt. The value is in milliseconds.

### Properties of the Stomp object

Property | Description
---------|------------
VERSIONS | Versions object
clientFromUrl() | clientFromUrl(url, protocols)
clientFromFactory() | clientFromFactory(wsFactory)
Frame() | Constructor for Frame object

### Properties of a Client object

Property | Description
---------|------------
Client() | new Client(wsFactory)
wsFactory | wsFactory()
reconnect_delay | 0
counter | 0
connected | false
heartbeat | { outgoing: 10000, incoming: 10000 }
maxWebSocketFrameSize | 16 * 1024
subscriptions |  {}
partialData | ''
debug | debug(message)
connect | connect(headers, connectCallback, errorCallback)
connect | connect(login, passcode, connectCallback, errorCallback, closeEventCallback, host)
disconnect | disconnect(disconnectCallback, headers)
send | send(destination, headers, body)
subscribe | subscribe(destination, subscribeCallback, headers)
unsubscribe | unsubscribe(id, headers)
begin | begin(transaction_id)
commit | commit(transaction_id)
abort | abort(transaction_id)
ack | ack(messageID, subscription, headers)
nack | nack(messageID, subscription, headers)

### Properties of a Frame object

Property | Description
---------|------------
Frame() | new Frame(command, headers, body, escapeHeaderValues)
toString | toString()
unmarshall | unmarshall(datas, escapeHeaderValues)
marshall | marshall(command, headers, body, escapeHeaderValues)
sizeOfUTF8 | sizeOfUTF8(s)
frEscape | frEscape(str)
frUnEscape | frUnEscape(str)

# Further Documentation

Please refer to the [original documentation on GitHub](https://stomp-js.github.io/stomp-websocket/codo/extra/docs-src/Introduction.md.html). Alternatively you can query [The Internet™](https://duckduckgo.com/).

# Cocos

If you need web sockets in a Cocos project, simply copy the source file as a Javascript asset to your project. You must flag it as a Cocos plugin. In my testing that was sufficient. Afterwards the `Stomp` object is available in the global `window` context.

# Sockjs

In many online tutorials Stomp.js is used in combination with Sockjs. Sockjs is essentially a web socket factory that might provide standard web sockets, or fall back to some compatibility layer tunneling pseudo web sockets over http. After including the Sockjs.js script, you could use it like this:

	let webSocketFactory = function() {
		return new SockJS(httpUrlString);
	};
	let wsClient = Stomp.clientFromFactory(webSocketFactory);

Particularly when trying to use it with Cocos I ran into issues and had a closer look at the Sockjs.js source code. It turns out, the code is not only a generated heap of convoluted function calls and function applications that is almost impossible to disentangle, it also celebrates global dependencies right down to the innermost units of code (possibly caught by some of the many nested closures, but who can tell).

So unless you have one of the premeditated use cases you might be out of luck using this library.
