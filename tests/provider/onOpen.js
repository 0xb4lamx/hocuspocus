import assert from 'assert'
import * as Y from 'yjs'
import WebSocket from 'ws'
import { Hocuspocus } from '../../packages/server/src'
import { HocuspocusProvider } from '../../packages/provider/src'

let client
const ydoc = new Y.Doc()
const Server = new Hocuspocus()

context('provider/onOpen', () => {
  before(() => {
    Server.configure({ port: 4000 }).listen()
  })

  after(() => {
    Server.destroy()
  })

  afterEach(() => {
    client.destroy()
  })

  it('onOpen callback is executed', done => {
    client = new HocuspocusProvider({
      url: 'ws://127.0.0.1:4000',
      name: 'hocuspocus-test',
      document: ydoc,
      WebSocketPolyfill: WebSocket,
      onOpen: () => {
        done()
      },
    })
  })

  it("on('open') callback is executed", done => {
    client = new HocuspocusProvider({
      url: 'ws://127.0.0.1:4000',
      name: 'hocuspocus-test',
      document: ydoc,
      WebSocketPolyfill: WebSocket,
    })

    client.on('open', () => {
      done()
    })
  })
})
