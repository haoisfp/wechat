// pages/scan/scan.js
import bleManager from '../../utils/ble-manager';

Page({
  data: {
    scanning: false,
    devices: [],
    onlyESP32: true,
    savedDeviceId: '',
    connecting: false,
    connectingId: '' // 正在连接的设备ID
  },

  onLoad() {
    console.log('[SCAN] 页面加载');

    // 初始化
    this.setData({
      savedDeviceId: bleManager.deviceId || ''
    });

    // 注册蓝牙事件回调
    this.registerBLECallbacks();
  },

  onShow() {
    console.log('[SCAN] 页面显示');

    // 确保回调被正确注册
    this.registerBLECallbacks();

    // 开始扫描
    this.startScan();
  },

  onHide() {
    console.log('[SCAN] 页面隐藏');

    // 页面隐藏时停止扫描
    this.stopScan();

    // 页面隐藏时清理回调，防止干扰其他页面
    this.unregisterBLECallbacks();
  },

  // 注册蓝牙回调
  registerBLECallbacks() {
    console.log('[SCAN] 注册蓝牙回调');

    // 注册设备发现回调
    bleManager.registerCallback('onDeviceFound', (devices) => {
      // 按照是否为ESP32设备、是否已保存、信号强度排序
      console.log('[SCAN] 发现设备');

      devices.sort((a, b) => {
        // 已保存设备排在最前
        if (a.deviceId === this.data.savedDeviceId && b.deviceId !== this.data.savedDeviceId) return -1;
        if (a.deviceId !== this.data.savedDeviceId && b.deviceId === this.data.savedDeviceId) return 1;

        // ESP32设备优先
        if (a.isESP32 && !b.isESP32) return -1;
        if (!a.isESP32 && b.isESP32) return 1;

        // 信号强度排序
        return b.RSSI - a.RSSI;
      });

      this.setData({
        devices
      });
    });

    // 注册连接回调
    bleManager.registerCallback('onConnected', (data) => {
      this.setData({
        connecting: false,
        connectingId: ''
      });

      wx.showToast({
        title: '验证成功',
        icon: 'success'
      });


      // 验证成功回调
      bleManager.registerCallback('onVerified', (data) => {
        console.log('[SCAN] 验证成功:', data);

        // 验证后立即请求读取设备信息
        this.readDeviceInfo();

        wx.showToast({
          title: '验证成功',
          icon: 'success'
        });

        // 返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      });
    });

    // 注册错误回调
    bleManager.registerCallback('onError', (error) => {
      this.setData({
        connecting: false,
        connectingId: ''
      });

      wx.showToast({
        title: error.message,
        icon: 'none'
      });
    });

    // 断开连接回调
    bleManager.registerCallback('onDisconnected', (data) => {
      console.log('[SCAN] 断开连接回调:', data);
      this.setData({
        connecting: false,
        connectingId: ''
      });
    });
  },

  // 取消注册蓝牙回调
  unregisterBLECallbacks() {
    console.log('[SCAN] 取消注册蓝牙回调');

    // 取消注册所有回调
    bleManager.registerCallback('onDeviceFound', null);
    bleManager.registerCallback('onConnected', null);
    bleManager.registerCallback('onError', null);
    bleManager.registerCallback('onDisconnected', null);
    bleManager.registerCallback('onVerified', null);
  },

  // 读取设备信息
  readDeviceInfo() {
    bleManager.readDeviceInfo().catch(error => {
      console.error('[SCAN] 读取设备信息失败', error);
    });
  },

  // 开始扫描
  startScan() {
    if (this.data.scanning) {
      // 如果扫描超过30秒，强制重置状态
      const now = Date.now();
      if (this._scanStartTime && (now - this._scanStartTime > 30000)) {
        console.log('[SCAN] 扫描操作超时，重置状态');
        this.setData({
          scanning: false
        });
      } else {
        return;
      }
    }

    // 检查蓝牙是否已经初始化
    if (!bleManager.isInitialized) {
      console.log('[SCAN] 蓝牙未初始化，无法开始扫描');
      wx.showToast({
        title: '蓝牙未初始化，请返回首页',
        icon: 'none'
      });
      return;
    }

    // 记录扫描开始时间
    this._scanStartTime = Date.now();

    wx.showLoading({
      title: '开始扫描...'
    });

    // 添加扫描超时 - 修改这里，保存计时器引用
    this._scanTimeout = setTimeout(() => {
      if (this.data.scanning) {
        console.log('[SCAN] 扫描超时');
        bleManager.stopScan().finally(() => {
          this.setData({
            scanning: false
          });
        });
      }
    }, 30000);

    // 开始扫描
    bleManager.startScan({
      onlyESP32: this.data.onlyESP32
    }).then(success => {
      wx.hideLoading();

      if (success) {
        this.setData({
          scanning: true
        });
      } else {
        this.setData({
          scanning: false
        });

        // 如果扫描失败，清除计时器
        if (this._scanTimeout) {
          clearTimeout(this._scanTimeout);
          this._scanTimeout = null;
        }

        wx.showToast({
          title: '扫描失败',
          icon: 'none'
        });
      }
    }).catch(error => {
      clearTimeout(this._scanTimeout);
      this._scanTimeout = null;

      wx.hideLoading();
      this.setData({
        scanning: false
      });

      wx.showToast({
        title: '扫描失败: ' + (error.errMsg || '未知错误'),
        icon: 'none'
      });
    });
  },

  // 停止扫描
  async stopScan() {
    if (!this.data.scanning) return;

    console.log("[SCAN] 停止扫描");

    // 立即更新扫描状态，避免异步问题
    this.setData({
      scanning: false
    });

    // 清除扫描超时计时器
    if (this._scanTimeout) {
      clearTimeout(this._scanTimeout);
      this._scanTimeout = null;
    }

    // 调用蓝牙管理器停止扫描并等待其完成
    try {
      await bleManager.stopScan();
      console.log("[SCAN] 停止扫描成功");
    } catch (error) {
      console.error("[SCAN] 停止扫描出错:", error);
    }

    // 函数结束，JavaScript 会自动隐式返回一个 resolved 的 Promise
  },

  // 切换是否只显示ESP32设备
  async toggleFilter() {
    const newValue = !this.data.onlyESP32;
    this.setData({
      onlyESP32: newValue
    });

    // 显示加载提示
    wx.showLoading({
      title: '正在切换模式...'
    });

    try {
      // 重新开始扫描 - 确保等待停止扫描完成
      await this.stopScan();
      this.startScan();
    } finally {
      // 无论成功与否，都隐藏加载提示
      wx.hideLoading();
    }
  },

  // 计算RSSI百分比
  getRssiPercent(rssi) {
    // 将RSSI值转换为百分比（RSSI通常在-100到0之间）
    const percent = Math.max(0, Math.min(100, (100 + rssi)));
    return percent + '%';
  },

  // 连接设备
  connectDevice(e) {
    const deviceId = e.currentTarget.dataset.deviceid;
    const deviceName = e.currentTarget.dataset.devicename;

    // 检查是否已在连接
    if (this.data.connecting) {
      this.setData({
        connecting: false,
        connectingId: ''
      });

      // 如果已经处于"连接中"状态超过15秒，则重置状态
      const now = Date.now();
      if (this._connectStartTime && (now - this._connectStartTime > 15000)) {
        console.log('[SCAN] 连接操作超时，重置状态');
        this.setData({
          connecting: false,
          connectingId: ''
        });
      } else {
        return; // 如果正在连接且未超时，则不执行新的连接
      }
    }

    // 记录连接开始时间
    this._connectStartTime = Date.now();

    this.setData({
      connecting: true,
      connectingId: deviceId
    });

    // 停止扫描
    this.stopScan();

    wx.showLoading({
      title: '正在连接...'
    });

    // 添加15秒超时
    const connectTimeout = setTimeout(() => {
      if (this.data.connecting && this.data.connectingId === deviceId) {
        wx.hideLoading();
        this.setData({
          connecting: false,
          connectingId: ''
        });
        wx.showToast({
          title: '连接超时',
          icon: 'none'
        });
      }
    }, 15000);

    // 直接尝试连接，让系统处理蓝牙权限
    bleManager.connectDevice(deviceId, deviceName).then(success => {
      clearTimeout(connectTimeout); // 清除超时计时器
      wx.hideLoading();

      if (!success) {
        this.setData({
          connecting: false,
          connectingId: ''
        });
      }
    }).catch(error => {
      clearTimeout(connectTimeout); // 清除超时计时器
      wx.hideLoading();
      this.setData({
        connecting: false,
        connectingId: ''
      });

      // 显示错误信息
      wx.showToast({
        title: '连接失败: ' + (error.errMsg || '未知错误'),
        icon: 'none'
      });
    });
  },

  // 页面卸载时清理
  onUnload() {
    console.log('[SCAN] 页面卸载，清理回调');

    // 取消注册蓝牙回调，防止内存泄漏
    this.unregisterBLECallbacks();

    // 页面卸载时停止扫描
    this.stopScan();
  }
})