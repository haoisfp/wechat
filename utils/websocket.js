import { MsgType } from './socketConstants'
// 事件监听器，用于pressure页面监听websocket消息
const eventBus = {
  listeners: {},
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    // 避免重复添加相同的回调
    if (!this.listeners[event].includes(callback)) {
      this.listeners[event].push(callback);
    }
  },
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  },
  off(event, callback) {
    if (this.listeners[event]) {
      if (callback) {
        // 如果提供了具体的callback，只移除该callback
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      } else {
        // 如果没有提供callback，清除该事件的所有监听器
        this.listeners[event] = [];
      }
    }
  }
};
const app=getApp()
class WebSocketManager {
  constructor() {
    if (WebSocketManager.instance) {
      return WebSocketManager.instance;
    }
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.ready = false;
    this.messageQueue = [];
    this.heartbeatInterval = null;
    this.heartbeatTimeout = 30000;
    this.connectPromise = null;
  }

  connect(sid) {
    if (this.isConnected) return Promise.resolve();
    if(this.isConnecting){
      console.log('WebSocket正在连接中');
      return new Promise((resolve) => {
        setTimeout(() => resolve(), 100);
      });
    }

    if(this.connectPromise){
      return this.connectPromise;
    }
    
    this.connectPromise = new Promise((resolve,reject) =>{
try{

  // 确保所有WebSocket连接都已关闭
  if(this.isConnected){
  this.closeAllWebSocketConnections();
  }
  this.isConnecting = true;
  const baseurl = `${app.globalData.baseUrl}/webSocket/${sid}`;
  const url = baseurl.replace('http://', 'ws://').replace('https://', 'wss://');

  console.log('正在连接WebSocket:', url);
  wx.connectSocket({
      url: url,
      header: {
        'content-type': 'application/json',
        'Authorization': app.globalData.token || ''
      },
      success: () => {
        console.log('WebSocket连接建立成功');
      },
      fail:(error) => {
        console.log(this.url)
        console.error("websocket连接失败")
        this.isConnecting = false;
        this.connectPromise = null;
        reject(error);
        this.reconnect(sid);
      }
    });
    this.initEventHandlers(resolve,reject);
  }catch (error) {
    console.error('WebSocket连接失败：', error);
    this.connectPromise = null;
    this.isConnecting = false;
    reject(error);
    this.reconnect();
  }
}).finally(() => {
  // 连接完成后重置状态
  this.isConnecting = false;
});
return this.connectPromise;
}

  initEventHandlers(resolve, reject) {
    wx.onSocketOpen(() => {
      console.log('WebSocket连接已打开');
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
    });

  // 监听WebSocket接收到服务器的消息事件
  wx.onSocketMessage((res) => {
    try {
      const message = JSON.parse(res.data);
      // 触发pressure页面事件监听器
      eventBus.emit('websocketMessage', message);
    } catch (error) {
      console.error('消息解析错误：', error);
    }
  });

  // 监听WebSocket连接关闭事件
  wx.onSocketClose(() => {
    console.log('WebSocket连接已关闭');
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.ready = false;
    this.messageQueue = [];
    this.heartbeatInterval = null;
    this.heartbeatTimeout = 30000;
    this.connectPromise = null;
  });

  // 监听WebSocket错误事件
  wx.onSocketError((error) => {
    console.error('WebSocket错误：', error);
    this.isConnected = false;
    this.connectPromise = null;
    this.isConnecting = false;
    reject(error);
    this.handleError(error);
    this.reconnect();
  });
  }

   // 关闭所有WebSocket连接
   closeAllWebSocketConnections() {
    return new Promise((resolve) => {
      try {
        // 移除所有事件监听器
        wx.onSocketOpen(null);  
        wx.onSocketError(null);
        wx.onSocketMessage(null);
        wx.onSocketClose(null);


        // 强制关闭WebSocket连接
        wx.closeSocket({
          success: () => {
            console.log('成功关闭所有WebSocket连接');
            this.resetState();
            resolve();
          },
          fail: (error) => {
            console.error('关闭WebSocket连接失败:', error);
            this.resetState();
            resolve();
          }
        });
      } catch (error) {
        console.error('关闭WebSocket连接时出错:', error);
        this.resetState();
        resolve();
      }
    });
  }
  handleMessage(message) {
    switch (message.msgType) {
        case "CONNECT":
          wx.showToast({
            title: message.msg,
            icon: 'success',
            duration: 2000
          });
          break;
        case "CLOSE":
          wx.showModal({
            title: message.msg,
            content: "CLOSE",
            showCancel: false
          });
          break;
        case "INFO":
          wx.showToast({
            title: message.msg,
            icon: 'success',
            duration: 2000
          });
          if (message.msg === 'WEB_CALIBRATE'){
            this.sendMessage({
              msgType: 'INFO',
              msg: 'WX_CALIBRATE_RECEIVED'
            })
          }
          else if(message.msg === 'WEB_CALIBRATE_RECIVED'){
            this.ready = true;
          }
          break;
        case "ERROR":
          wx.showToast({
            title: message.msg,
            icon: 'ERROR',
            duration: 2000
          });
          break;
    }
}
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('达到最大重连次数');
      return;
    }
    
    this.reconnectAttempts++;
    setTimeout(() => {
      console.log(`第${this.reconnectAttempts}次重连尝试`);
      this.connect();
    }, 1000 * this.reconnectAttempts);
  }
  handleError(error) {
    wx.showToast({
      title: '连接异常，正在重试',
      icon: 'none',
      duration: 2000
    });
  }
  sendMessage(data) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        console.log('WebSocket未连接，消息加入队列:', data);
        this.messageQueue.push(data);
        resolve();
        return;
      }
      wx.sendSocketMessage({
        data: JSON.stringify(data),
        success: () => {
          console.log('消息发送成功');
          resolve();
        },
        fail: (error) => {
          console.error('消息发送失败：', error);
          reject(error);
        }
      });
    });
  }
  
  close() {
    return new Promise((resolve, reject) => {
      if (!this.isConnecting && !this.isConnected) {
        console.log('WebSocket已经关闭');
        resolve();
        return;
      }

      try {
        // 先发送关闭消息给服务器
        wx.sendSocketMessage({
          data: JSON.stringify({
            msgType: 'CLOSE',
            msg: 'CLIENT_CLOSING'
          }),
          success: () => {
            console.log('发送关闭消息成功');
            this.ws = null;
            this.isConnected = false;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.maxReconnectAttempts = 3;
            this.ready = false;
            this.messageQueue = [];
            this.heartbeatInterval = null;
            this.heartbeatTimeout = 30000;
            this.connectPromise = null;
            WebSocketManager.instance = this;
          },
          fail: (error) => {
            console.error('发送关闭消息失败:', error);
            this.forceClose();
            resolve();
          }
        });
      } catch (error) {
        console.error('关闭WebSocket时发生错误:', error);
        this.forceClose();
        resolve();
      }
    });
  }
  resetState() {
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.messageQueue = [];
    console.log('WebSocket状态已重置');
  }
}

const webSocketManager = new WebSocketManager();

export { webSocketManager, eventBus };