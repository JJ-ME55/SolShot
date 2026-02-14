import io from 'socket.io-client'

const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5001'

export const socket = io(serverUrl)
