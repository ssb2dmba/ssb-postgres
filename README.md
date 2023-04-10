# ssb-postgres

[secret-stack](https://github.com/ssbc/secret-stack) plugin which provides storing of valid secure-scuttlebutt
messages in Postgres.

## Table of contents

[What does it do?](#what-does-it-do) | 
[Example](#example) | 
[Concepts](#concepts) | 
[API](#api) | 
[Stability](#stability) | 
[License](#License) | 

# What does it do?

`ssb-postgres`  is a port of[ssb-db](https://github.com/ssbc/ssb-db) to Postgres instead of Flume.

For now it's a proof of concept aimed only a making works the SSB Kotlin app [delog](https://delog.info). 
Theorically in near future more methods of the original `ssb-db` API shall be implemented. 

 `ssb-postgres` provides tools for dealing with unforgeable append-only message feeds. You can create a feed, post 
messages to that feed, verify a feed created by someone else, stream messages to and from feeds, and more 
(see [API](#api)).

*Unforgeable* means that only the owner of a feed can modify that feed, as enforced by digital signing 
(see [Security properties](#security-properties)).

This property makes `ssb-postgres` useful for peer-to-peer applications. `ssb-postgres` also makes it easy to encrypt 
messages.

# Example

In this example, we create a feed, post a signed message to it, then create a stream that reads from the feed. **Note:** `ssb-server` includes the `ssb-postgres` dependency already, so the example here uses this as a plugin for `secret-stack`.

``` js
/**
 * create an ssb-postgres instance and add a message to it.
 */
var pull = require('pull-stream')

//create a secret-stack instance and add ssb-postgres, for persistence.
var createApp = require('secret-stack')({})
  .use(require('ssb-postgres'))


// create the db instance.
// Only one instance may be created at a time due to os locks on port and database files.

var app = createApp(require('ssb-config'))

//your public key, the default key of this instance.

app.id

//or, called remotely

app.whoami(function (err, data) {
  console.log(data.id) //your id
})

// publish a message to default identity
//  - feed.add appends a message to your key's chain.
//  - the `type` attribute is required.

app.publish({ type: 'post', text: 'My First Post!' }, function (err, msg) {
  // the message as it appears in the database:
  console.log(msg)

  // and its hash:
  console.log(msg.key)
})


// collect all messages for a particular keypair into an array, calls back, and then ends
// https://github.com/pull-stream/pull-stream/blob/master/docs/sinks/collect.md
pull(
  app.createHistoryStream({id: app.id}),
  pull.collect(function (err, messagesArray) {
    console.log(messagesArray)
  })
)
```

# Concepts

Building upon `ssb-postgres` requires understanding a few concepts that it uses to ensure the unforgeability of 
message feeds.

## Identities

An identity is simply a public/private key pair.

Even though there is no worldwide store of identities, it's infeasible for anyone to forge your identity. 
Identities are binary strings, so not particularly human-readable.

## Feeds

A feed is an append-only sequence of messages. Each feed is associated 1:1 with an identity. The feed is 
identified by its public key. This works because public keys are unique.

Since feeds are append-only, replication is simple:  request all messages in the feed that are newer than 
the latest message you know about.

Note that append-only really means append-only: you cannot delete an existing message. If you want to enable 
entities to be deleted or modified in your data model, that can be implemented in a layer on top of `ssb-postgres` 
using [delta encoding](https://en.wikipedia.org/wiki/Delta_encoding).

## Messages

Each message contains:

- A message object. This is the thing that the end user cares about. If there is no encryption, this is a `{}` 
object. If there is encryption, this is an encrypted string.
- A content-hash of the previous message. This prevents somebody with the private key from changing the feed 
history after publishing, as a newly-created message wouldn't match the "prev-hash" of later messages which 
were already replicated.
- The signing public key.
- A signature. This prevents malicious parties from writing fake messages to a stream.
- A sequence number. This prevents a malicious party from making a copy of the feed that omits or reorders 
messages.
  
Since each message contains a reference to the previous message, a feed must be replicated in order, starting 
with the first message. This is the only way that the feed can be verified. A feed can be *viewed* in any order 
after it's been replicated.

## Object ids

The text inside a message can refer to three types of ssb-postgres entities: messages, feeds, and blobs (i.e. 
attachments). Messages and blobs are referred to by their hashes, but a feed is referred to by its signing 
public key. Thus, a message within a feed can refer to another feed, or to a particular point _within_ a feed.

Object ids begin with a sigil `@` `%` and `&` for a `feedId`, `msgId` and `blobId` respectively.

Note that `ssb-postgres` does not include facilities for retrieving a blob given the hash.

## Replication

It is possible to easily replicate data between two instances of `ssb-postgres`.
First, they exchange maps of their newest data. Then, each one downloads all data newer than its newest data.

[ssb-server](https://github.com/ssbc/ssb-server) is a tool that makes it easy to replicate multiple instances 
of ssb-postgres using a decentralized network.

## Security properties

`ssb-postgres` maintains useful security properties even when it is connected to a malicious ssb-postgres database. This 
makes it ideal as a store for peer-to-peer applications.

Imagine that we want to read from a feed for which we know the identity, but we're connected to a malicious 
ssb-postgres instance. As long as the malicious database does not have the private key:

- The malicious database cannot create a new feed with the same identifier
- The malicious database cannot write new fake messages to the feed
- The malicious database cannot reorder the messages in the feed
- The malicious database cannot send us a new copy of the feed that omits messages from the middle
- The malicious database *can* refuse to send us the feed, or only send
  us the first *N* messages in the feed
- Messages may optionally be encrypted. See `test/end-to-end.js`.


## API
## require('ssb-postgres')
```js 
SecretStack.use(require('ssb-postgres')) => SecretStackApp
```

The design pattern of __ssb-postgres__ is for it to act as a plugin within the 
[SecretStack](https://github.com/ssbc/secret-stack) plugin framework. The main export provides the plugin, 
which extends the SecretStack app with this plugins functionality, and API.
`ssb-postgres` adds persistence to a [SecretStack](https://github.com/ssbc/secret-stack) setup.
Without other plugins, this instance will not have replication or querying. Loading `ssb-postgres` directly is 
useful for testing, but it's recommended to instead start from a plugin bundle like 
[ssb-server](https://github.com/ssbc/ssb-server)

> Because of legacy reasons, all the `ssb-postgres` methods are mounted on the top level object, so it's `app.get` 
instead of `app.db.get` as it would be with all the other `ssb-*` plugins.

> In the API docs below, we'll just call it `db`

## db.get: async
```js
db.get(id | seq | opts, cb) // cb(error, message)
```

Get a message by its hash-id.

* If `id` is a message id, the message is returned.
* If `seq` is provided, the message at that offset. 
* If `opts` is passed, the message id is taken from either `opts.id` or `opts.key`.
* If `opts.private = true` the message will be decrypted if possible.
* If `opts.meta = true` is set, or `seq` is used, the message will be in `{key, value: msg, timestamp}` format. 
Otherwise the raw message (without key and timestamp) are returned. This is for backwards compatibility reasons.

Given that most other apis (such as createLogStream) by default return `{key, value, timestamp}` it's 
recommended to use `db.get({id: key, meta: true}, cb)`

Note that the `cb` callback is called with 3 arguments: `cb(err, msg, offset)`, where
the 3rd argument is the `offset` position of that message in the log (flumelog-offset).

## db.add: async
```js
db.add(msg, cb) // cb(error, data)
```

Append a raw message to the local log. `msg` must be a valid, signed message. 
[ssb-validate](https://github.com/ssbc/ssb-validate) is used internally to validate messages.

## db.publish: async
```js
db.publish(content, cb) // cb(error, data)
```
Create a valid message with `content` with the default identity and append it to the local log. 
[ssb-validate](https://github.com/ssbc/ssb-validate) is used to construct a valid message.

This is the recommended method for publishing new messages, as it handles the tasks of correctly setting 
the message's timestamp, sequence number, previous-hash, and signature.

 - `content` (object): The content of the message.
   - `.type` (string): The object's type.


## db.del: async 

> ⚠ This could break your feed. Please don't run this unless you understand it.

Delete a message by its message key or a whole feed by its key. This only deletes the message from your local 
database, not the network, and could have unintended consequences if you try to delete a single message in 
the middle of a feed.

The intended use-case is to delete all messages from a given feed *or* deleting a single message from the tip 
of your feed if you're completely confident that the message hasn't left your device.

```js
//Delete message
db.del(msg.key, (err, key) => {
  if (err) throw err
})
```

```js
//Delete all author messages
db.del(msg.value.author, (err, key) => {
  if (err) throw err
})
```

## db.whoami: async
```js
db.whoami(cb) // cb(error, {"id": FeedID })
```
Get information about the current ssb-server user.


## db.createHistoryStream: source
```js
db.createHistoryStream(id, seq, live) -> PullSource
//or
db.createHistoryStream({ id, seq, live, limit, keys, values, reverse }) -> PullSource

```

Create a stream of the history of `id`. If `seq > 0`, then only stream messages with sequence numbers greater 
than `seq`. If `live` is true, the stream will be a 
[live mode](https://github.com/dominictarr/pull-level#example---reading)

`createHistoryStream` and `createUserStream` serve the same purpose.

`createHistoryStream` exists as a separate call because it provides fewer range parameters, which makes it 
safer for RPC between untrusted peers.

> Note: since `createHistoryStream` is provided over the network to anonymous peers, not all options are 
supported. `createHistoryStream` does not decrypt private messages.

- `id` *(FeedID)* The id of the feed to fetch.
- `seq` *(number)* If `seq > 0`, then only stream messages with sequence numbers greater than or equal to `seq`. 
Defaults to `0`.
- `live` *(boolean)*: Keep the stream open and emit new messages as they are received. Defaults to `false`
- `keys` *(boolean)*: Whether the `data` event should contain keys. If set to `true` and `values` set to 
`false` then `data` events will simply be keys, rather than objects with a `key` property. Defaults to `true`
- `values` *(boolean)* Whether the `data` event should contain values. If set to `true` and `keys` set to 
`false` then `data` events will simply be values, rather than objects with a `value` property. Defaults to `true`.
- `limit` *(number)* Limit the number of results collected by this stream. This number represents a *maximum* 
number of results and may not be reached if you get to the end of the data first. A value of `-1` means there 
is no limit. When `reverse=true` the highest keys will be returned instead of the lowest keys. Defaults to `false`.
- `reverse` *(boolean)* Set true and the stream output will be reversed. Beware that due to the way LevelDB 
works, a reverse seek will be slower than a forward seek. Defaults to `false`.


## Stability

__UNSTABLE__  Alpha only few method are implemented using Postgres.


## License

MIT / GPL-v3
