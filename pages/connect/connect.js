// pages/connect/connect.js
import bleManager from '../../utils/ble-manager';

Page({
  data: {
    hasDevice: false,
    deviceName: '',
    isConnected: false,
    isVerified: false,
    isPaired: false,
    connecting: false,
    deviceInfo: null,
    bleInitialized: false, // 标记蓝牙是否已初始化
    reconnectEn: false // 断开连接后的可再次连接
  },

  onLoad() {
    console.log('[INDEX] 页面加载');
    // 检查是否有已保存的设备
    this.checkSavedDevice();

    // 初始化蓝牙
    this.initializeBLE();

    // 注册蓝牙事件回调
    this.registerBLECallbacks();
  },

  onShow() {
    console.log('[INDEX] 页面显示');
    // 每次页面显示时检查设备状态
    this.checkDeviceStatus();

    // 确保回调被正确注册
    this.registerBLECallbacks();

    // 如果蓝牙已断开，尝试重新初始化
    if (!bleManager.isInitialized) {
      this.initializeBLE();
    }
    //用于检查取消配对后 更新新连接中状态
    this.CheckStatusTimeout();
  },

  onHide() {
    console.log('[INDEX] 页面隐藏');
    // 页面隐藏时清理回调，防止干扰其他页面
    this.unregisterBLECallbacks();
  },

  // 初始化蓝牙
  initializeBLE() {
    console.log('[INDEX] 初始化蓝牙');
    if (bleManager.isInitialized) {
      console.log('[INDEX] 蓝牙已经初始化');
      this.setData({
        bleInitialized: true
      });
      return Promise.resolve(true);
    }

    wx.showLoading({
      title: '初始化蓝牙...'
    });

    return bleManager.initialize().then(success => {
      wx.hideLoading();

      this.setData({
        bleInitialized: success
      });

      if (success) {
        console.log('[INDEX] 蓝牙初始化成功');
        // 如果有保存的设备，尝试自动连接
        if (this.data.hasDevice && !this.data.isConnected) {
          this.connectSavedDevice();
        }
      } else {
        console.log('[INDEX] 蓝牙初始化失败');
        wx.showToast({
          title: '蓝牙初始化失败，请确保蓝牙已开启',
          icon: 'none'
        });
      }

      return success;
    }).catch(error => {
      wx.hideLoading();
      console.error('[INDEX] 蓝牙初始化出错:', error);
      this.setData({
        bleInitialized: false
      });

      wx.showToast({
        title: '蓝牙初始化失败: ' + (error.errMsg || '未知错误'),
        icon: 'none'
      });

      return false;
    });
  },

  // 检查是否有已保存的设备
  checkSavedDevice() {
    if (bleManager.deviceId) {
      this.setData({
        hasDevice: true,
        deviceName: bleManager.deviceName || '未知设备'
      });
    } else {
      this.setData({
        hasDevice: false,
        deviceName: ''
      });
    }
  },

  // 检查设备连接状态
  checkDeviceStatus() {
    // 获取安全状态
    const secStatus = bleManager.getSecurityStatus();

    this.setData({
      isConnected: bleManager.isConnected,
      isPaired: secStatus.isPaired,
      isVerified: secStatus.isVerified
    });

    // 如果连接状态发生变化，更新设备信息显示
    if (!this.data.isConnected) {
      this.setData({
        deviceInfo: null
      });
    }

    //尝试读取设备信息  已验证才能读取
    this.readDeviceInfo();
  },
  resetDeviceStateAndNotify(msg = '设备已断开连接') {
    // 1. 重置页面状态
    this.setData({
      isConnected: false,
      isVerified: false,
      isPaired: bleManager.isPaired,
      connecting: false,
      deviceInfo: null,
      reconnectEn: false,
      hasDevice: false,
      deviceName: '',
      bleInitialized: false
    });
    // 2. 清除全局变量
    getApp().globalData.connectedDevice = null;
    // 3. 清除本地存储
    wx.removeStorageSync('connectedDevice');
    // 4. 提示用户
    wx.showToast({
      title: msg,
      icon: 'none'
    });
  },
  onDisconnect() {
    getApp().globalData.connectedDevice = null;
    wx.removeStorageSync('connectedDevice');
    wx.showToast({ title: '设备已断开', icon: 'none' });
  },
  // 注册BLE回调
  registerBLECallbacks() {
    console.log('[INDEX] 注册蓝牙回调');

    // 连接成功回调
    bleManager.registerCallback('onConnected', (data) => {
      console.log('[INDEX] 连接成功回调:', data);
      this.setData({
        isConnected: true,
        connecting: false
      });
      getApp().globalData.connectedDevice = {
        deviceId: data.deviceId,
        deviceName: data.deviceName
      };
    });

    // 验证成功回调
    bleManager.registerCallback('onVerified', (data) => {
      console.log('[INDEX] 验证成功:', data);
      this.setData({
        isVerified: true,
        isConnected: true,
        connecting: false
      });
      getApp().globalData.connectedDevice = {
        deviceId: data.deviceId,
        deviceName: data.deviceName
      };
      wx.setStorageSync('connectedDevice', {
        deviceId: data.deviceId,
        deviceName: data.deviceName
      });
      //验证后立即读取设备信息
      this.readDeviceInfo();

      wx.showToast({
        title: '连接成功',
        icon: 'success'
      });
    });

    // 断开连接回调
    bleManager.registerCallback('onDisconnected', (data) => {
      console.log('[INDEX] 断开连接回调:', data);
      this.resetDeviceStateAndNotify('设备已断开连接');
      // 如果有断开原因，显示提示
      // if (data && data.reason && data.reason !== 'NORMAL') {
      //   wx.showToast({
      //     title: '连接已断开: ' + this._getDisconnectReason(data.reason),
      //     icon: 'none'
      //   });
      // }
    });

    // 错误回调
    bleManager.registerCallback('onError', (error) => {
      console.log('[INDEX] 错误回调:', error);

      // 更新状态
      this.setData({
        connecting: false
      });

      // 对于超时错误，刷新连接状态
      if (error.code === 'SECURITY_TIMEOUT' || error.code === 'CONNECTION_TIMEOUT') {
        this.resetDeviceStateAndNotify('设备连接超时，已断开');
        return;
      }

      // 显示错误消息
      wx.showToast({
        title: error.message,
        icon: 'none'
      });
    });

    // 命令响应回调
    bleManager.registerCallback('onCommandResponse', (response) => {
      console.log('[INDEX] 命令响应回调:', response);

      // 处理特定命令响应
      switch (response.type) {
        case 'UNPAIR_DEVICE':
          if (response.success) {
            this.setData({
              isPaired: false
            });
          }
          break;

        case 'FACTORY_RESET':
          if (response.success) {
            this.setData({
              isPaired: false,
              isVerified: false
            });
          }
          break;

          // 添加对INFO_READ类型的处理
        case 'INFO_READ':
          if (response.success && response.deviceInfo) {
            // 更新设备信息到页面
            this.setData({
              deviceInfo: response.deviceInfo,
              isPaired: response.deviceInfo.isPaired
            });
            console.log("ID " + response.deviceInfo.deviceId)
            console.log('[INDEX] 更新设备信息:', response.deviceInfo);
          }
          break;
      }
    });
  },
  // 取消注册BLE回调
  unregisterBLECallbacks() {
    console.log('[INDEX] 取消注册蓝牙回调');

    // 取消注册所有回调
    bleManager.registerCallback('onConnected', null);
    bleManager.registerCallback('onDisconnected', null);
    bleManager.registerCallback('onError', null);
    bleManager.registerCallback('onCharacteristicChanged', null);
    bleManager.registerCallback('onVerified', null);
    bleManager.registerCallback('onPaired', null);
    bleManager.registerCallback('onCommandResponse', null);
  },

  // 获取断开连接原因的友好显示文本
  _getDisconnectReason(reason) {
    const reasons = {
      'ADAPTER_OFF': '蓝牙已关闭',
      'DEVICE_DISCONNECTED': '设备断开连接',
      'RESET': '连接已重置',
      'SECURITY_TIMEOUT': '安全验证超时',
      'CONNECTION_TIMEOUT': '连接空闲超时'
    };

    return reasons[reason] || '未知原因';
  },

  // 连接已保存的设备
  connectSavedDevice() {
    if (!bleManager.deviceId) {
      return;
    }

    // 如果已经在连接中，防止重复操作
    if (this.data.connecting) {
      return;
    }

    // 确保蓝牙已初始化
    if (!bleManager.isInitialized) {
      this.initializeBLE().then(success => {
        if (success) {
          this.doConnectSavedDevice();
        }
      });
    } else {
      this.doConnectSavedDevice();
    }
  },

  // 执行已保存设备的连接过程 - 保存超时计时器引用以便取消
  doConnectSavedDevice() {
    this.setData({
      connecting: true
    });

    wx.showLoading({
      title: '正在连接...'
    });

    // 添加连接超时处理，并保存计时器引用以便取消
    this._connectTimeout = setTimeout(() => {
      if (this.data.connecting) {
        wx.hideLoading();
        this.setData({
          connecting: false
        });
        wx.showToast({
          title: '连接超时',
          icon: 'none'
        });
      }
    }, 15000);

    // 直接尝试连接，让系统处理蓝牙权限
    bleManager.connectSavedDevice().then(success => {
      clearTimeout(this._connectTimeout);
      this._connectTimeout = null;
      wx.hideLoading();

      if (!success) {
        this.setData({
          connecting: false
        });
      }
    }).catch(error => {
      clearTimeout(this._connectTimeout);
      this._connectTimeout = null;
      wx.hideLoading();
      this.setData({
        connecting: false
      });

      // 显示错误信息
      wx.showToast({
        title: '连接失败: ' + (error.errMsg || error.message || '未知错误'),
        icon: 'none'
      });
    });
  },

  // 断开连接
  disconnectDevice() {
    wx.showLoading({
      title: '断开连接...'
    });

    bleManager.disconnectDevice().then(() => {

      this.setData({
        isConnected: false,
        isVerified: false,
        deviceInfo: null,
        reconnectEn: true
      });

      // 1000ms后才允许重新连接
      setTimeout(() => {
        this.setData({
          reconnectEn: false
        });
        wx.hideLoading();

      }, 500);
    }).catch(error => {
      wx.hideLoading();

      wx.showToast({
        title: '断开连接失败',
        icon: 'none'
      });
    });
  },

  // 读取设备信息
  readDeviceInfo() {
    if (!this.data.isConnected || !this.data.isVerified) return;

    bleManager.readDeviceInfo().catch(error => {
      console.error('[INDEX] 读取设备信息失败', error);
    });
  },

//用于检查取消配对后 更新新连接中状态 用于处理取消配对后页面显示异常的问题
CheckStatusTimeout() {
  if (this.data.connecting) { //出现配对弹窗时等一会点击取消 触发
    setTimeout(() => {
      this.checkDeviceStatus(); //5s后如果在连接中，再次检查设备状态ss
      if (!this.data.isConnected) {
        this.setData({
          connecting: false,
          isConnected: false
        });
      }
    }, 5000);
  }
  // if (this.data.isConnected && !this.data.isVerified) {  //出现输入配对密码弹窗时等一会点击取消 会触发
  //   setTimeout(() => {
  //     console.log("验证中中超时")
  //     this.checkDeviceStatus(); //5s后如果在连接中，再次检查设备状态ss
  //     if (this.data.isConnected) {
  //       this.disconnectDevice();
  //       console.log("验证中中超时2")
  //     }
  //   }, 5000);
  // }
},
  // 跳转到扫描页面
  goToScan() {
    console.log('[INDEX] 跳转到扫描页面，强制断开当前连接');

    // 清除连接状态
    this.setData({
      connecting: false
    });

    // 如果已连接，强制断开连接
    if (this.data.isConnected) {
      // 静默断开，不显示加载提示
      bleManager.disconnectDevice().catch(error => {
        console.error('[INDEX] 强制断开连接失败:', error);
      });
    }

    // 取消可能存在的超时计时器
    if (this._connectTimeout) {
      clearTimeout(this._connectTimeout);
      this._connectTimeout = null;
    }

    // 直接跳转到扫描页面，不检查蓝牙初始化
    wx.navigateTo({
      url: '/pages/scan/scan'
    });
  },

  // 跳转到设备管理页面
  goToDevice() {
    wx.navigateTo({
      url: '/pages/device/device'
    });
  },

  // 页面卸载时清理
  onUnload() {
    console.log('[INDEX] 页面卸载，清理回调');
    // 取消注册蓝牙回调，防止内存泄漏
    this.unregisterBLECallbacks();
  }
})