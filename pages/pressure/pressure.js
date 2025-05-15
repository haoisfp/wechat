// pages/pressure/pressure.js
import { handleTabChange } from '../../utils/navigator';
import { webSocketManager, eventBus } from '../../utils/websocket';
import bleManager from '../../utils/ble-manager';
const themeManager = require('../../utils/themeManager');
const app = getApp();
const device = app.globalData.connectedDevice;

Page({
  data: {
    active: 'pressure', //在菜单栏显示选中
    isDarkMode: app.globalData.isDarkMode, //深色模式
    //蓝牙扫描
    scanning: false,
    devices: [],
    onlyESP32: true,
    connecting: false,
    connectingId: '', // 正在连接的设备ID
    // 蓝牙连接
    showBLEDialog: false, // 蓝牙扫描弹窗
    devices: [], // 扫描到的设备列表
    hasDevice: true,
    deviceName:'',
    connectedDevice: null, // 已连接的设备
     // ... 现有的 data ...
     bleInitialized: false, // 标记蓝牙是否已初始化
     isVerified: false, // 设备是否已验证
     isPaired: false, // 设备是否已配对
     deviceInfo: null, // 设备信息
     bleVerifyStatus: '', // '', 'verifying', 'success', 'fail'
    bleVerifyMessage: '', // 验证提示信息
    // ...原有data
    showMonitorDialog: false,
    monitorStatus: '', // '', 'loading', 'success', 'fail'
    monitorMessage: '',
    monitorData: null, // 实时数据内容
    isRefreshing: false,
    showCalibrateDialog: false, // 是否展示校准弹窗
    webReady: false, // 标记医生端是否上线
    isConnected: bleManager.isConnected, // 设备连接
    calibrateMessage: '', // 校准过程文字提示
    calibrating: false,  // 是否处于校准中
    confirmButtonText: '开始校准', // 动态改变按钮文字
    calibrationInProgress: false,
    calibrationTimer: null,
    calibrationCount: 0,
    calibrationMaxCount: 20, // 10秒/0.5秒
    calibrationPressure: null,
    calibrationProgress: 0, // 进度百分比
    maxTransmissionTime: 30000, // 最大传输时间30秒(毫秒)
  transmissionStartTime: 0, // 传输开始时间戳
  transmissionTimer: null, // 传输计时器
    showCancelButton: true, // 控制取消按钮的显示
    startTrans: false, // 是否正在进行实时数据传输
    pressureRecords: [], // 存储历史压力数据
    lastRequestTime: 0,  // 上次请求数据的时间戳
    transferInProgress: false, // 数据传输状态
    lastUpdateTime: '', // 最后一次数据更新时间
    pressureData: [
      {
        currentValue: 70,  // 实际值，单位rpx
        recommendMin: 40,  // 推荐最小值，单位rpx
        recommendMax: 80   // 推荐最大值，单位rpx
      },
      {
        currentValue: 40,
        recommendMin: 40,
        recommendMax: 80
      },
      {
        currentValue: 25,
        recommendMin: 40,
        recommendMax: 80
      }
    ], // 压力值百分比
    themeData: {},
    themeClass: 'light-mode',
    beforeClose: function(action) {
      // 点击确认按钮时不关闭弹窗
      if (action === 'confirm') {
        return false;
      }
      // 点击取消按钮时走正常的关闭流程
      if (action === 'cancel') {
          return true;
      }
      return true;
    },
    bleScanBeforeClose: function(action) {
      // 点击确认按钮(刷新)时不关闭弹窗
      if (action === 'confirm') {
        return false;
      }
      // 点击取消按钮时走正常的关闭流程
      if (action === 'cancel') {
        return true;
      }
      return true;
    }
  },
  onLoad: function() {
    console.log(this.calculatePressure2(0.30));
    app.checkLoginStatus();
    // 初始化页面主题
    themeManager.initTheme(this);
     // 绑定websocket回调函数，确保this指向正确
    this.boundHandleConnectionState = this.handleConnectionState.bind(this);
    this.boundHandleWebSocketMessage = this.handleWebSocketMessage.bind(this);
    if (this.data.pressureRecords.length > 0 && !this.data.lastUpdateTime) {
      const lastRecord = this.data.pressureRecords[this.data.pressureRecords.length - 1];
      if (lastRecord && lastRecord.timestamp) {
        this.setData({
          lastUpdateTime: this.formatTime(lastRecord.timestamp)
        });
      }
    }
  },
  onShow: function() {

    if (bleManager.isInitialized) {
      // 如果设备已连接但页面状态不匹配，更新状态
      if (bleManager.isConnected && !this.data.isConnected) {
        console.log('[PRESSURE] 检测到设备已连接但页面状态未更新，正在同步状态');
        this.setData({
          isConnected: true,
          connecting: false,
          showBLEDialog: false
        });
      }
      
      // 如果设备已验证但页面状态不匹配，更新状态
      if (bleManager.isVerified && !this.data.isVerified) {
        console.log('[PRESSURE] 检测到设备已验证但页面状态未更新，正在同步状态');
        this.setData({
          isVerified: true,
          isConnected: true,
          connecting: false,
          showBLEDialog: false
        });
      }
    }
    
    // 如果显示正在连接但超过一定时间，关闭加载框
    if (this.data.connecting) {
      wx.hideLoading();
      this.setData({ connecting: false });
    }
  },
  onUnload() {
    wx.closeSocket()
    // 移除事件监听
    this.removeWebSocketListeners();
      // 取消注册所有蓝牙回调
    this.unregisterBLECallbacks();
    this.setData({
      bleVerifyStatus: '',
      bleVerifyMessage: ''
    })
    
  },
  onHide(){
    wx.closeSocket()
      // 只有在弹窗已关闭的情况下才取消蓝牙回调
    if (!this.data.showBLEDialog) {
      console.log('[PRESSURE] 蓝牙弹窗已关闭，取消蓝牙回调');
      this.unregisterBLECallbacks();
      this.stopScan();
    } else {
      console.log('[PRESSURE] 蓝牙弹窗开启中，保留蓝牙回调');
    }
  },
  // 菜单栏切换
  onChange(event) {
    const name = event.detail;
    this.setData({ active: name });
    handleTabChange(name);
  },
  // 处理压力数据更新
  checkLogin: async function() {
    if (!app.globalData.isLogin) {
      wx.getUserProfile({
        desc: '获取用户的信息',//获取用户的信息
        success:res => {//用户成功授权
         console.log("成功",res)
         this.setData({
           nickName:res.userInfo.nickName,
           touxian:res.userInfo.avatarUrl
         })
        }
      })
    }
  },
  // 检查是否已连接设备
  checkDeviceConnected() {
    return !!(bleManager.isConnected && bleManager.isVerified);
  },
  // 压力监测按钮点击事件
  async goTomoniter() {
    // 检查设备连接状态 - 只信任bleManager的实时状态
    if (!(bleManager.isConnected && bleManager.isVerified)) {
      wx.showModal({
        title: '未连接设备',
        content: '请先前往设备连接页面完成蓝牙连接。',
        confirmText: '去连接',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/connect/connect' });
          }
        }
      });
      return;
    }

    // 已连接，弹出实时监测弹窗并显示动画
    // 已连接设备的情况
    wx.showLoading({
    title: '正在获取数据...'
    });
    try {
      // 调用刷新数据方法
      await this.refreshData();
      
      // 数据刷新成功后显示成功提示
      wx.hideLoading();
      wx.showToast({
        title: '数据已同步',
        icon: 'success',
        duration: 1500
      });
    } catch (error) {
      wx.hideLoading();
      console.error('[PRESSURE] 获取数据失败:', error);
      wx.showToast({
        title: '数据同步失败',
        icon: 'none',
        duration: 1500
      });
    }
  },
  async refreshData() {
    try {
      // 注册一次性回调来捕获结果
      const resultPromise = new Promise((resolve, reject) => {
        const commandCallback = (response) => {
          if (response.type === 'CALIB_RES') {
            if (response.success && response.calibrationInfo) {
              resolve(response.calibrationInfo);
            } else {
              reject(new Error('获取数据失败'));
            }
            // 使用后取消注册回调
            bleManager.registerCallback('onCommandResponse', null);
          }
        };
        
        // 注册回调
        bleManager.registerCallback('onCommandResponse', commandCallback);
        
        // 设置超时
        setTimeout(() => {
          bleManager.registerCallback('onCommandResponse', null);
          reject(new Error('获取数据超时'));
        }, 8000);
      });
  
      // 发送获取数据命令
      await bleManager.getCalibrationInfo();
      
      // 等待结果
      const calibrationInfo = await resultPromise;
      
      // 直接更新页面的压力数据
      const value1 = Math.round(calibrationInfo.pressure1 * 100);
      const value2 = Math.round(calibrationInfo.pressure2 * 100);
      const value3 = Math.round(calibrationInfo.pressure3 * 100);
      
      
      console.log('[PRESSURE] 新获取的压力值:', value1, value2, value3);
      
      const formatPressure1 = this.calculatePressure2(value1);
      const formatPressure2 = this.calculatePressure2(value2);
      const formatPressure3 = this.calculatePressure2(value3);

      console.log('[PRESSURE] 计算后的压力值:', formatPressure1, formatPressure2, formatPressure3);
      // 更新显示
      this.setData({
        'pressureData[0].currentValue': formatPressure1,
        'pressureData[1].currentValue': formatPressure2,
        'pressureData[2].currentValue': formatPressure3
      });
  
      // 同时保存这一次的数据，可能需要额外处理
      const newRecord = {
        timestamp: calibrationInfo.timestamp,
        pressure1: calibrationInfo.pressure1,
        pressure2: calibrationInfo.pressure2,
        pressure3: calibrationInfo.pressure3
      };
      
      // 格式化并设置最后更新时间
      const formattedTime = this.formatTime(calibrationInfo.timestamp || Date.now());
      this.setData({
        pressureRecords: [...this.data.pressureRecords, newRecord],
        lastUpdateTime: formattedTime
      });
      
      return calibrationInfo;
  
    } catch (error) {
      console.error('[PRESSURE] 刷新数据失败:', error);
      throw error;
    }
  },
  closeMonitorDialog() {
    this.setData({
      showMonitorDialog: false,
      monitorStatus: '',
      monitorMessage: '',
      monitorData: null
    });
    bleManager.registerCallback('onCommandResponse', null);
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
  resetDeviceStateAndNotify(msg = '设备已断开连接') {
    this.setData({
      isConnected: false,
      isVerified: false,
      connecting: false,
      deviceInfo: null,
      isPaired: bleManager.isPaired,
      showBLEDialog: false,
      showMonitorDialog: false  // 断开时关闭监测弹窗
    });
    getApp().globalData.connectedDevice = null;
    wx.removeStorageSync('connectedDevice');
    wx.showToast({
      title: msg,
      icon: 'none'
    });
  },
  // 注册BLE回调
  registerBLECallbacks() {
    console.log('[PRESSURE] 注册蓝牙回调');

    // 设备发现回调
  bleManager.registerCallback('onDeviceFound', (devices) => {
    console.log('[PRESSURE] 发现设备:', devices);
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

    bleManager.registerCallback('onConnected', (data) => {
      console.log('[PRESSURE] 连接成功回调:', data);
      this.setData({
        isConnected: true,
        connecting: false,
        connectingId: ''
      });
      wx.showToast({
        title: '验证成功',
        icon: 'success'
      });
    });

    bleManager.registerCallback('onVerified',async (data) => {
      console.log('[PRESSURE] 验证成功:', data);
      this.setData({
        isVerified: true,
        isConnected: true,
        connecting: false,
        bleVerifyStatus: 'success',
        bleVerifyMessage: '设备验证成功！',
        showBLEDialog: false, // 直接在这里设置关闭弹窗
        connectedDevice: {
          deviceId: data.deviceId,
          name: data.deviceName
        }
      });
      
      wx.hideLoading();
      // 显示连接成功提示
      wx.showToast({
        title: '设备连接成功',
        icon: 'success',
        duration: 2000
      });
      try {
        await bleManager.readDeviceInfo();
        // 5. 启用数据通知
        await bleManager.enableNotifications();
        
        // 6. 请求最新压力数据
        await this.requestPressureData();
        wx.showToast({
          title: '实时数据已同步',
          icon: 'success',
          duration: 2000
        });
      } catch (error) {
        console.error('[PRESSURE] 初始化设备数据失败:', error);
        wx.showToast({
          title: '数据同步失败，请重试',
          icon: 'none'
        });
      }
    });
    // 添加数据传输完成回调
  bleManager.registerCallback('onTransferCompleted', (result) => {
    this.handleDataTransferComplete(result);
  });

  // 添加命令响应回调处理
  bleManager.registerCallback('onCommandResponse', (response) => {
    // 处理特定命令响应
    switch (response.type) {
      case 'UNPAIR_DEVICE':
        if (response.success) {
          this.setData({
            isPaired: false
          });
        }
        break;
      case 'CALIB_RES':
        console.log('[PRESSURE] 收到校准响应，准备处理数据'); // 添加详细日志
        if (response.success) {
          this.handleCalibrationData(response);
        } else {
          console.error('[PRESSURE] 校准响应失败'); // 添加失败日志
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

    bleManager.registerCallback('onDisconnected', (data) => {
      console.log('[PRESSURE] 断开连接回调:', data);
      this.resetDeviceStateAndNotify('设备已断开连接');
    });

    bleManager.registerCallback('onError', (error) => {
      if (error.code === 'AUTH_FAILED') {
        this.setData({
          bleVerifyStatus: 'fail',
          bleVerifyMessage: '设备验证失败，请重试'
        });
      }
      else{
        console.log('[PRESSURE] 错误回调:', error);
        wx.hideLoading();
      }
     // 仅在特定情况下关闭弹窗
  if (error.code === 'SECURITY_TIMEOUT' || error.code === 'CONNECTION_TIMEOUT') {
    this.resetDeviceStateAndNotify('设备连接超时，已断开');
      return;
    
    // 显示错误提示，但不关闭弹窗
    wx.showToast({
      title: error.message || '连接超时',
      icon: 'none'
    });
  } else if (error.code === 'CONNECT_FAILED') {
    this.setData({
      connecting: false,
      connectingId: ''
    });
    
    wx.showToast({
      title: "连接失败，请重试",
      icon: 'none',
      duration: 2000
    });
  } else {
    // 其他错误，保持弹窗打开
    this.setData({ 
      connecting: false,
      connectingId: ''
    });
    
    wx.showToast({
      title: error.message || '操作失败',
      icon: 'none'
    });
  }
})
    },
    // 取消注册BLE回调
  unregisterBLECallbacks() {
    console.log('[PRESSURE] 取消注册蓝牙回调');
    bleManager.registerCallback('onConnected', null);
    bleManager.registerCallback('onDisconnected', null);
    bleManager.registerCallback('onError', null);
    bleManager.registerCallback('onCharacteristicChanged', null);
    bleManager.registerCallback('onVerified', null);
    bleManager.registerCallback('onPaired', null);
    bleManager.registerCallback('onCommandResponse', null);
    bleManager.registerCallback('onTransferCompleted', null);
  },
    // 处理数据传输完成
    handleDataTransferComplete(result) {
      // 确保我们有结果和记录
  if (!result || !result.records) {
    console.warn('[PRESSURE] 数据传输完成但没有记录');
    this.setData({ transferInProgress: false });
    return;
  }
  
  console.log('[PRESSURE] 收到总记录数:', result.records.length);
  
  // 处理和格式化数据记录
  const processedRecords = result.records.map(record => {
    if (!record) return null;

    try {
      // 兼容两种不同的数据格式
      // 检查是否有pressure数据格式（旧格式）
      const hasPressureData = record.pressure1 !== undefined || 
                              record.pressure2 !== undefined || 
                              record.pressure3 !== undefined;
      
      if (hasPressureData) {
        // 如果是pressure格式，直接使用
        return {
          timestamp: record.timestamp,
          formattedTime: this.formatTime(record.timestamp),
          pressure1: record.pressure1 || 0,
          pressure2: record.pressure2 || 0,
          pressure3: record.pressure3 || 0,
          // 标记数据类型
          dataType: 'pressure'
        };
      } else {
        // 如果是voltage格式，保持原样
        return {
          timestamp: record.timestamp,
          formattedTime: this.formatTime(record.timestamp),
          voltage1: typeof record.voltage1 === 'number' ? record.voltage1 : null,
          voltage2: typeof record.voltage2 === 'number' ? record.voltage2 : null,
          voltage3: typeof record.voltage3 === 'number' ? record.voltage3 : null,
          // 标记数据类型
          dataType: 'voltage'
        };
      }
    } catch (err) {
      console.error('[PRESSURE] 处理记录时出错:', err, record);
      return null;
    }
  }).filter(record => record !== null);
  
  // 更新状态和记录
  this.setData({
    transferInProgress: false,
    pressureRecords: processedRecords
  });

  // 如果有记录，更新显示的压力数据
  if (processedRecords.length > 0) {
    const latestRecord = processedRecords[processedRecords.length - 1];
    console.log('[PRESSURE] 最新记录:', latestRecord);
    this.updatePressureDataScaled(latestRecord);
  }
  
  // 显示成功提示
  wx.showToast({
    title: '数据同步成功',
    icon: 'success',
    duration: 1500
  });
},
formatTime(timestamp) {
  if (!timestamp) return '-';

  // 检查时间戳是否以毫秒为单位
  if (timestamp < 10000000000) {
    // 时间戳是秒为单位，转换为毫秒
    timestamp = timestamp * 1000;
  }

  // 创建Date对象
  const date = new Date(timestamp);
  
  // 直接使用固定的 UTC+8 时区（北京时间）
  // 年份是从0开始的，需要加1
  const year = date.getUTCFullYear();
  // 月份是从0开始的，需要加1
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hours = (date.getUTCHours() + 8) % 24;  // 加8小时，如果超过24小时则取模
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');

  return `${month}-${day} ${hours.toString().padStart(2, '0')}:${minutes}:${seconds}`;
},
refreshDevices() {
  console.log('[PRESSURE] 刷新设备列表');
  
  // 清空当前设备列表
  this.setData({
    devices: []
  });
  
  // 停止当前扫描
  this.stopScan();
  
 // 重新开始扫描
 setTimeout(() => {
  this.startScan();
}, 200); // 短暂延迟确保之前的扫描已完全停止
return false;
},
// 根据传感器电压计算压力值
calculatePressure(voltage) {
  /// 传感器参数
  const RAO_RES = 10000; // 反馈电阻10K
  
  // 根据公式: Uo = (1 + RAO_RES × 1/Rx) × 0.1
  // 反向计算: 1/Rx = (Uo/0.1 - 1) / RAO_RES
  const invRx = (voltage / 0.1 - 1) / RAO_RES;
  
  // 根据关系式: 1/Rx = 0.0004·F + 0.3749
  // 求解F: F = (1/Rx - 0.3749) / 0.0004
  const pressureForceGrams = (invRx - 0.3749) / 0.0004;
  
  // 将克(g)转换为牛顿(N)，1g ≈ 0.00981N
  const pressureForceNewtons = pressureForceGrams * 0.00981;
  
  // 返回计算得到的压力值，单位为牛顿(N)
  return Math.max(0, pressureForceNewtons);
},
calculatePressure2(pressure){
  return (((3.3-pressure)/100000*pressure)-0.3749)/0.0004
},
 // 更新压力数据(放大版本，适合UI显示)
updatePressureDataScaled(data) {
  console.log('[PRESSURE] 更新压力数据:', data);
  
  if (!data) {
    console.warn('[PRESSURE] 尝试更新空数据');
    return;
  }
  
  // 确保数据格式正确
  if (data.pressure1 !== undefined) {
    // 直接使用压力值 (旧格式)
    const value1 = Math.round(data.pressure1 * 100);
    const value2 = Math.round(data.pressure2 * 100);
    const value3 = Math.round(data.pressure3 * 100);
    
    console.log('[PRESSURE] 使用已有压力值:', value1, value2, value3);
    
    this.setData({
      'pressureData[0].currentValue': value1,
      'pressureData[1].currentValue': value2,
      'pressureData[2].currentValue': value3
    });
    return;
  }
  
  // 使用电压计算压力 (新格式)
  if (data.voltage1 === null && data.voltage2 === null && data.voltage3 === null) {
    console.warn('[PRESSURE] 所有电压值为空，无法更新压力');

    return;
  }
  
  // 计算有效的压力值
  let value1 = this.data.pressureData[0].currentValue;
  let value2 = this.data.pressureData[1].currentValue;
  let value3 = this.data.pressureData[2].currentValue;
  
  // 只处理有效的电压值
  if (data.voltage1 !== null) {
    const pressure1 = this.calculatePressure(data.voltage1);
    value1 = Math.round(pressure1 * 100);
  }
  
  if (data.voltage2 !== null) {
    const pressure2 = this.calculatePressure(data.voltage2);
    value2 = Math.round(pressure2 * 100);
  }
  
  if (data.voltage3 !== null) {
    const pressure3 = this.calculatePressure(data.voltage3);
    value3 = Math.round(pressure3 * 100);
  }
  
  console.log('[PRESSURE] 计算的压力值:', value1, value2, value3);
  
  // 更新UI显示
  this.setData({
    'pressureData[0].currentValue': value1,
    'pressureData[1].currentValue': value2,
    'pressureData[2].currentValue': value3
  });
},
  // 处理特征值变化（接收压力数据）
  handleCharacteristicChanged(res) {
    if (!res || !res.value) return;
    
     // 判断是否是数据特征值，避免处理协议消息
    const characteristicId = res.characteristicId?.toUpperCase() || '';
    if (characteristicId !== bleManager.characteristicIds.data) {
      return; // 不是数据特征值，可能是其他协议消息
    }
    try {
      // 检查是否是实时数据（通常第一个字节会有特定标记）
      const dataArray = new Uint8Array(res.value);
      
      // 如果第一个字节是协议标识符（如0x01-0x09），则不是实时数据
      if (dataArray[0] <= 9) {
        return; // 这是协议消息，由BLE管理器处理
      }
      
      // 解析压力数据（假设数据格式为3个浮点数）
    const dataView = new DataView(res.value);
    const voltage1 = dataView.getFloat32(0, true);
    const voltage2 = dataView.getFloat32(4, true);
    const voltage3 = dataView.getFloat32(8, true);

    console.log('[PRESSURE] 收到实时电压数据:', voltage1, voltage2, voltage3);
    
    // 修复：变量名正确
    const voltageData = {
      voltage1: voltage1,
      voltage2: voltage2, 
      voltage3: voltage3
    };
      this.updatePressureDataScaled(voltageData);
    } catch (error) {
      console.error('[PRESSURE] 解析压力数据失败:', error);
    }
  },

// 处理命令响应
handleCommandResponse(response) {
  console.log('[PRESSURE] 命令响应:', response);
  
  if (response.type === 'START_TRANS') {
    this.setData({ transferInProgress: true });
    console.log('[PRESSURE] 开始接收数据, 总记录数:', response.totalRecords);

    // 收到START_TRANS响应后，需要请求第一个数据包
    setTimeout(async () => {
      try {
        // 请求第一个数据包(包序号从0开始)
        console.log('[PRESSURE] 请求第一个数据包(包序号0)');
        await bleManager.requestDataPacket(0);
      } catch (error) {
        console.error('[PRESSURE] 请求数据包失败:', error);
        this.setData({ transferInProgress: false });
      }
    }, 200); // 稍微延迟以确保设备准备好
  } else if (response.type === 'DATA_PACK' && response.records?.length > 0) {
    console.log('[PRESSURE] 收到数据包, 记录数:', response.records.length);

    // 保存记录
    this.setData({
      pressureRecords: response.records
    });
    
    // 更新当前显示的压力值(将压力值放大100倍以便在UI上显示)
    const latestRecord = response.records[response.records.length - 1];
    this.updatePressureDataScaled(latestRecord);
    
    // 如果有下一个包需要请求，就继续请求
    if (response.currentPacket < response.totalPackets) {
      setTimeout(async () => {
        try {
          console.log('[PRESSURE] 请求下一个数据包(包序号' + response.currentPacket + ')');
          await bleManager.requestDataPacket(response.currentPacket);
        } catch (error) {
          console.error('[PRESSURE] 请求数据包失败:', error);
        }
      }, 200);
    }
  } else if (response.type === 'INFO_READ' && response.success && response.deviceInfo) {
    this.setData({
      deviceInfo: response.deviceInfo,
      isPaired: response.deviceInfo.isPaired
    });
  }
},

// 更新压力数据
updatePressureData(data) {
  this.setData({
    'pressureData[0].currentValue': data.pressure1,
    'pressureData[1].currentValue': data.pressure2,
    'pressureData[2].currentValue': data.pressure3
  });
},
  

  // 读取设备信息
  readDeviceInfo() {
    if (!this.data.isConnected || !this.data.isVerified) return;
    bleManager.readDeviceInfo().catch(error => {
      console.error('[PRESSURE] 读取设备信息失败', error);
    });
  },
async requestPressureData(startTimeOffset = 24 * 60 * 60) {
  if (!this.data.isConnected || !this.data.isVerified) {
    console.log('[PRESSURE] 设备未连接或未验证，无法请求数据');
    return;
  }

  try {
    // 计算24小时前的时间戳（秒）
    const startTime = Math.floor(Date.now() / 1000) - startTimeOffset;
    
    console.log('[PRESSURE] 请求压力数据，起始时间:', new Date(startTime * 1000).toLocaleString());
    
    this.setData({ 
      transferInProgress: true,
      lastRequestTime: Date.now()
    });

    // 请求数据
    const success = await bleManager.requestData(startTime);
    
    if (!success) {
      this.setData({ transferInProgress: false });
      wx.showToast({
        title: '请求数据失败',
        icon: 'none'
      });
    }
  } catch (error) {
    console.error('[PRESSURE] 请求数据失败:', error);
    this.setData({ transferInProgress: false });
    wx.showToast({
      title: '请求数据失败: ' + (error.message || '未知错误'),
      icon: 'none'
    });
  }
},
  // 关闭蓝牙弹窗
  closeBLEDialog() {
    console.log('[PRESSURE] 关闭蓝牙弹窗，取消所有蓝牙回调');
    this.stopScan();
    wx.hideLoading(); // 确保加载提示被关闭
  
  this.setData({
    showBLEDialog: false,
    connecting: false, // 重置连接状态
    scanning: false, // 重置扫描状态
    bleVerifyStatus: '',
    bleVerifyMessage: ''
  });
  // 如果没有成功连接和验证设备，取消所有蓝牙回调
  if (!this.data.isVerified) {
    console.log('[PRESSURE] 未完成设备验证，取消所有蓝牙回调');
    this.unregisterBLECallbacks();
    
    // 断开可能存在的连接
    if (this.data.isConnected) {
      bleManager.disconnectDevice().catch(error => {
        console.error('[PRESSURE] 断开连接失败:', error);
      });
    }
  } else {
    console.log('[PRESSURE] 设备已验证，保留蓝牙回调');
  }
  },
  // 添加一个统一的移除监听器方法
  removeWebSocketListeners() {
    // 检查绑定函数是否存在
  if (this.boundHandleConnectionState) {
    eventBus.off('websocketStateChange', this.boundHandleConnectionState);
  }
  
  if (this.boundHandleWebSocketMessage) {
    eventBus.off('websocketMessage', this.boundHandleWebSocketMessage);
  }
  },
  // 压力校准按钮点击事件
  onCalibrateTap() {
    // 先移除之前的事件监听，避免重复监听
    this.removeWebSocketListeners();
    // 确保回调函数已经绑定
  if (!this.boundHandleConnectionState) {
    this.boundHandleConnectionState = this.handleConnectionState.bind(this);
  }
  
  if (!this.boundHandleWebSocketMessage) {
    this.boundHandleWebSocketMessage = this.handleWebSocketMessage.bind(this);
  }
  
    // 添加事件监听
  eventBus.on('websocketStateChange', this.boundHandleConnectionState);
  eventBus.on('websocketMessage', this.boundHandleWebSocketMessage);
    this.handleConnectionState(true);
    // 初始化校准弹窗信息
    this.setData({ 
      showCalibrateDialog: true,
      calibrateMessage: '设备连接成功，等待医生相应连接...',
      showCancelButton: true,
      calibrating: false,
      webReady: false
    });

    const sid = `wx_${app.globalData.userId}`
    webSocketManager.connect(sid)
    .then(() => {
      this.setData({ 
        confirmButtonDisabled: true
      });
    })
    .catch(error => {
      console.error('WebSocket连接失败：', error);
      this.setData({
        isConnected: false,
        calibrateMessage: '设备连接失败，请检查设备状态',
        showConfirmButton: false,
        webReady: false
      });
    });
  },
  sendCalibrateMessage(){
    console.log("发送校准信息完成")
    const calibrateMessage = {
      msgType: 'INFO',
      msg: 'END'
    };

    webSocketManager.sendMessage(calibrateMessage)
      .catch(error => {
        console.error('发送校准命令失败：', error);
        this.setData({
          calibrating: false,
          showCancelButton: true,
          confirmButtonText: '重试校准',
          calibrateMessage: '校准命令发送失败，请重试'
      });
    });
  },
  // 校准开始
  handleCalibrate() {
    if (!this.data.webReady) {
      this.setData({ 
        calibrateMessage: '医生尚未连接，请等待系统通知后开始校准' ,
      });
      return;
    }
    if (this.data.calibrating) {
      // 取消校准
      if (this.data.calibrationTimer) {
        clearInterval(this.data.calibrationTimer);
        this.data.calibrationTimer = null;
      }
      this.setData({
        calibrating: false,
        calibrationInProgress: false,
        showCancelButton: true,
        confirmButtonText: '开始校准',
        calibrateMessage: '校准已取消'
      });
      
      // 恢复蓝牙连接超时计时器
      this.resumeBleConnectionTimer();
      
      // 通知医生端校准取消
      webSocketManager.sendMessage({ 
        msgType: 'CALIB_CANCEL',
        msg: '用户取消校准'
      });
      return;
    }
    if (!this.data.isConnected) {
      wx.showToast({
        title: '请先确保设备已连接',
        icon: 'none'
      });
      return;
    }
    
    // 用户点击开始校准，但不立即启动，只是通知医生端已准备好
    this.setData({
      showCancelButton: true,
      confirmButtonText: '取消校准',
      calibrateMessage: '已准备好校准，等待医生端发起传输...'
    });
    console.log("[PRESSURE] 等待医生端发出开始校准命令");
    
  },
  // 新增：处理校准数据
  async handleCalibrationData(response) {
    if (!response.success || !response.calibrationInfo) {
      console.log("[PRESSURE] 校准数据无效");
      return;
    }

    const { pressure1, pressure2, pressure3, timestamp } = response.calibrationInfo;
    console.log(`[PRESSURE] 获取校准数据: 压力1=${pressure1.toFixed(2)}, 压力2=${pressure2.toFixed(2)}, 压力3=${pressure3.toFixed(2)}`);
    
    // 动画效果：数字跳动/进度条
        this.setData({
      calibrationPressure: {
        pressure1: pressure1.toFixed(2),
        pressure2: pressure2.toFixed(2),
        pressure3: pressure3.toFixed(2)
      }
    });
    
    if (this.data.startTrans && this.data.webReady) {
      console.log("[PRESSURE] 发送校准数据到医生端");
      webSocketManager.sendMessage({
        msgType: 'CALIB_DATA',
        data: {
          pressure1, 
          pressure2, 
          pressure3,
          timestamp: response.calibrationInfo.timestamp
        }
      }).then(() => {
        console.log("[PRESSURE] 校准数据发送成功");
      }).catch(error => {
        console.error("[PRESSURE] 校准数据发送失败:", error);
      });
    } else {
      console.log("[PRESSURE] 未处于数据传输状态，不发送数据到网页端, 原因:", 
                "calibrating=" + this.data.calibrating, 
                "webReady=" + this.data.webReady,
                "startTrans=" + this.data.startTrans);
    }
  },
  // 添加暂停蓝牙连接超时计时器的函数
  pauseBleConnectionTimer() {
    console.log('[PRESSURE] 暂停蓝牙连接超时计时器');
    // 如果有计时器引用，则清除它
    if (bleManager._connectionTimeoutRef) {
      clearTimeout(bleManager._connectionTimeoutRef);
      bleManager._connectionTimeoutRef = null;
      console.log('[PRESSURE] 蓝牙连接超时计时器已暂停');
    }
  },

  // 添加恢复蓝牙连接超时计时器的函数
  resumeBleConnectionTimer() {
    console.log('[PRESSURE] 恢复蓝牙连接超时计时器');
    
    // 重新设置连接超时（假设超时时间为5分钟）
    if (!bleManager._connectionTimeoutRef && bleManager.isConnected) {
      bleManager._connectionTimeoutRef = setTimeout(() => {
        console.log('[PRESSURE] 蓝牙连接超时，自动断开');
        // 如果仍然连接中，则断开
        if (bleManager.isConnected) {
          bleManager.disconnectDevice().catch(err => {
            console.error('[PRESSURE] 断开连接失败:', err);
          });
        }
      }, 5 * 60 * 1000); // 5分钟超时
      
      console.log('[PRESSURE] 蓝牙连接超时计时器已恢复');
    }
  },
  // 校准结束
  finishCalibration() {
    console.log("[PRESSURE] 结束校准/数据传输过程");
    if (this.data.calibrationTimer) {
      clearInterval(this.data.calibrationTimer);
      this.data.calibrationTimer = null;
    }
    
    this.setData({
      calibrationInProgress: false,
          calibrating: false,
      isRealtimeTransmitting: false, // 确保停止实时数据传输
          showCancelButton: true,
      confirmButtonText: '完成',
      calibrateMessage: '数据传输完成！请确认医生端反馈'
    });
    
    // 校准完成后恢复蓝牙连接超时计时器
    this.resumeBleConnectionTimer();
    
    // 通知医生端校准/传输结束
    if (this.data.webReady) {
      console.log("[PRESSURE] 发送数据传输结束消息到医生端");
      webSocketManager.sendMessage({ msgType: 'TRANS_END' })
        .then(() => {
          console.log("[PRESSURE] 数据传输结束消息发送成功");
        })
        .catch(error => {
          console.error("[PRESSURE] 数据传输结束消息发送失败:", error);
        });
    }
  },
  // 监听服务器发送的websocket消息
  async handleWebSocketMessage(data) {
    console.log('收到消息：', data);
    if (data.msgType === 'INFO') {
      switch(data.msg) {
        case 'CALIBRATE':
          // 收到Web端的校准请求
          this.setData({
            webReady: true,
            calibrateMessage: '成功与医生建立连接，点击开始校准',
            confirmButtonText: '开始校准'
          });
          break;
        case 'START_TRANS':
          console.log("[PRESSURE] 收到开始传输的消息，启动实时数据采集");
          // 清除可能存在的旧计时器
          if (this.data.calibrationTimer) {
            clearInterval(this.data.calibrationTimer);
            this.data.calibrationTimer = null;
          }
          // 记录开始时间
          const startTime = Date.now();
          this.setData({
            calibrating: true,
            startTrans: true,
            calibrationInProgress: true,
            calibrationCount: 0,
            calibrationPressure: null,
            calibrationProgress: 0,
            transmissionStartTime: startTime,
            showCancelButton: false,
            confirmButtonText: '传输中...',
            calibrateMessage: '正在进行实时数据传输...'
          });
          // 暂停蓝牙连接超时计时器
          this.pauseBleConnectionTimer();

          // 设置30秒后自动停止
          this.data.transmissionTimer = setTimeout(() => {
            console.log("[PRESSURE] 传输达到最大时长30秒，自动停止");
            this.finishCalibration();
          }, this.data.maxTransmissionTime);

          // 启动定时器，每0.5秒采样一次，通过bleManager获取实时数据并发送到WebSocket
          this.data.calibrationTimer = setInterval(async () => {
            // 使用bleManager获取一次校准数据，数据将通过回调处理\
            const elapsedTime = Date.now() - this.data.transmissionStartTime;
            if (elapsedTime >= this.data.maxTransmissionTime) {
              console.log("[PRESSURE] 达到最大传输时长30秒，停止数据采集");
              this.finishCalibration();
              return;
            }
                // 使用bleManager获取校准数据，数据将通过回调自动处理并发送
            console.log("[PRESSURE] 获取第" + (this.data.calibrationCount + 1) + "次实时数据");
            try {
              // 使用新函数获取数据并发送
              await this.getCalibrationDataAndSend();
              
              // 更新UI进度
              const progressPercentage = Math.min(100, Math.round(elapsedTime / this.data.maxTransmissionTime * 100));
              this.setData({
                calibrationCount: this.data.calibrationCount + 1,
                calibrationProgress: progressPercentage
              });
            } catch (error) {
              console.error("[PRESSURE] 获取并发送校准数据失败:", error);
              // 错误处理：可以选择继续或停止
            }
        }, 500);
          break;
        case 'STOP_TRANS':
          console.log("[PRESSURE] 收到停止传输的消息，停止实时数据传输");
          // 停止数据采集
          if (this.data.calibrationTimer) {
            clearInterval(this.data.calibrationTimer);
            this.data.calibrationTimer = null;
          }
          this.setData({
            startTrans: false // 重置标志
          });
          this.finishCalibration();
          break;
      }
    } else if(data.msgType === 'CONNECT'){
      console.log("[PRESSURE] Websocket连接已建立");
    }
    else if (data.msgType === 'CLOSE') {
      if (this.data.calibrationInProgress) {
        this.finishCalibration();
        this.handleCalibrationComplete();
      }
      this.setData({
        calibrating: false,
        webReady: false,
        isRealtimeTransmitting: false, // 重置传输状态
        showCancelButton: true,
        confirmButtonText: '开始校准',
        calibrateMessage: '医生已断开连接，正在等待重连...'
      });
    }
  },
  startCalibDataCollection() {
    // 暂停蓝牙连接超时计时器以防止校准过程中断开连接
    this.pauseBleConnectionTimer();
    
    // 设置开始校准状态
    this.setData({
      calibrating: true,
      calibrationInProgress: true,
      calibrationCount: 0,
      calibrationPressure: null, 
      calibrationProgress: 0,
      showCancelButton: false,
      confirmButtonText: '停止校准',
      calibrateMessage: '正在校准中，实时压力数据已发送至医生端...'
    });
    
    // 清除之前可能存在的计时器
    if (this.data.calibrationTimer) {
      clearInterval(this.data.calibrationTimer);
      this.data.calibrationTimer = null;
    }
    
    // 启动定时器，每0.5秒采样一次并发送数据
    this.data.calibrationTimer = setInterval(() => {
      // 使用现有方法获取校准数据
      bleManager.getCalibrationInfo();
      
      // 更新UI进度，使用现有的计数逻辑
      this.setData({
        calibrationCount: this.data.calibrationCount + 1,
        // 这里无需上限检查，由医生端决定何时结束
        calibrationProgress: Math.min(100, Math.round(this.data.calibrationCount / 50 * 100))
      });
      
      // 注意：handleCalibrationData方法会在收到蓝牙响应后通过回调自动触发
      // 无需在这里手动调用发送数据的逻辑
    }, 500);
  },
  // 修改原有的finishCalibration方法，确保可以被其他方法调用
  finishCalibration() {
    console.log("[PRESSURE] 结束校准过程");
    if (this.data.calibrationTimer) {
      clearInterval(this.data.calibrationTimer);
      this.data.calibrationTimer = null;
    }
    if (this.data.transmissionTimer) {
      clearTimeout(this.data.transmissionTimer);
      this.data.transmissionTimer = null;
    }
    // 计算持续时间
  const duration = Date.now() - this.data.transmissionStartTime;
  const durationSeconds = Math.round(duration / 1000);
  
  // 恢复蓝牙连接超时计时器
  this.resumeBleConnectionTimer();
  
  // 更新UI状态
    this.setData({
    calibrationInProgress: false,
    calibrating: false,
    startTrans: false,
    showCancelButton: true,
    confirmButtonText: '完成',
    calibrateMessage: `校准完成！持续时间${durationSeconds}秒`
  });

    
    // 通知医生端校准结束
    if (this.data.webReady) {
      console.log("[PRESSURE] 发送校准结束消息到医生端");
    webSocketManager.sendMessage({ msgType: 'CALIB_END' })
      .then(() => {
        console.log("[PRESSURE] 校准结束消息发送成功");
      })
      .catch(error => {
        console.error("[PRESSURE] 校准结束消息发送失败:", error);
      });
    }
  },
  handleConnectionState(connected) {
    this.setData({
      isConnected: connected
    });
  },
  // 校准完成的处理
  handleCalibrationComplete() {
    const calibrateMessage = {
      msgType: 'CLOSE',
      msg: 'WX_CLOSE'
    };

    webSocketManager.sendMessage(calibrateMessage)
      .catch(error => {
        console.error('发送校准命令失败：', error);
        this.setData({
          calibrating: false,
          showCancelButton: true,
          confirmButtonText: '重试校准',
          calibrateMessage: '校准命令发送失败，请重试'
        });
      });
      this.setData({
        calibrating: false,
        showCancelButton: true,
        confirmButtonText: '完成',
        webReady: false,
        calibrateMessage: '校准完成！即将关闭当前窗口'
      });
      // 设置5秒后自动关闭
      setTimeout(() => {
        this.closeDialog();
      }, 5000);
  },
  onDialogClose() {
    if (this.data.calibrationInProgress && this.data.calibrationTimer) {
      clearInterval(this.data.calibrationTimer);
      this.data.calibrationTimer = null;
    }
    this.setData({
      calibrationInProgress: false,
      calibrating: false
    });
    if (this.data.calibrating) {
      wx.showModal({
        title: '提示',
        content: '校准正在进行中，确定要取消吗？',
        success: (res) => {
          if (res.confirm) {
            this.closeDialog();
          }
        }
      });
    } else {
      this.closeDialog();
    }
  },
  async closeDialog() {
    try {
      // 停止实时数据传输和校准过程
      if (this.data.calibrationTimer) {
        clearInterval(this.data.calibrationTimer);
        this.data.calibrationTimer = null;
      }
      
      // 恢复蓝牙连接超时计时器
      this.resumeBleConnectionTimer();
      
      // 关闭WebSocket连接
      wx.closeSocket({
        success(res) {
          console.log('WebSocket连接已关闭', res);
        }
      });
      
      // 移除事件监听
      this.removeWebSocketListeners();
      
      // 等待一小段时间确保连接已关闭
      await new Promise(resolve => setTimeout(resolve, 100));
        
      // 重置所有状态
      this.setData({ 
        showCalibrateDialog: false,
        calibrateMessage: '',
        calibrating: false,
        calibrationInProgress: false,
        isRealtimeTransmitting: false,
        webReady: false,
        confirmButtonText: '确认校准',
        showCancelButton: false,
        startTrans: false,
      });
    } catch (error) {
      console.error('关闭对话框出错：', error);
      wx.showToast({
        title: '关闭连接失败',
        icon: 'none'
      });
    }
  },
  // 切换主题
  toggleTheme() {
    themeManager.toggleTheme(this);
  },
  // 获取校准数据并发送到医生端
async getCalibrationDataAndSend() {
  try {
    // 注册一次性回调来捕获结果
    const resultPromise = new Promise((resolve, reject) => {
      const commandCallback = (response) => {
        if (response.type === 'CALIB_RES') {
          if (response.success && response.calibrationInfo) {
            resolve(response.calibrationInfo);
          } else {
            reject(new Error('获取校准数据失败'));
          }
          // 使用后取消注册回调
          bleManager.registerCallback('onCommandResponse', null);
        }
      };
      
      // 注册回调
      bleManager.registerCallback('onCommandResponse', commandCallback);
      
      // 设置超时
      setTimeout(() => {
        bleManager.registerCallback('onCommandResponse', null);
        reject(new Error('获取校准数据超时'));
      }, 8000);
    });

    // 发送获取数据命令
    await bleManager.getCalibrationInfo();
    
    // 等待结果
    const calibrationInfo = await resultPromise;
    
    // 提取校准数据
    const { pressure1, pressure2, pressure3, timestamp } = calibrationInfo;
    
    console.log(`[PRESSURE] 获取校准数据: 压力1=${pressure1.toFixed(2)}, 压力2=${pressure2.toFixed(2)}, 压力3=${pressure3.toFixed(2)}`);
    
    // 更新UI显示
    // 动画效果：数字跳动/进度条
    this.setData({
      calibrationPressure: {
        pressure1: pressure1.toFixed(2),
        pressure2: pressure2.toFixed(2),
        pressure3: pressure3.toFixed(2)
      }
    });
    
    // 将数值转换为百分比形式用于显示
    const value1 = Math.round(pressure1 * 100);
    const value2 = Math.round(pressure2 * 100);
    const value3 = Math.round(pressure3 * 100);
    
    // 更新压力显示
    this.setData({
      'pressureData[0].currentValue': value1,
      'pressureData[1].currentValue': value2,
      'pressureData[2].currentValue': value3
    });
    
    // 通过WebSocket发送校准数据到医生端
    if (this.data.webReady) {
      console.log("[PRESSURE] 发送校准数据到医生端");
      try {
        await webSocketManager.sendMessage({
          msgType: 'CALIB_DATA',
          data: {
            pressure1, 
            pressure2, 
            pressure3,
            timestamp: timestamp || Date.now()
          }
        });
        console.log("[PRESSURE] 校准数据发送成功");
      } catch (error) {
        console.error("[PRESSURE] 校准数据发送失败:", error);
        throw error; // 重新抛出错误以便上层处理
      }
    } else {
      console.log("[PRESSURE] WebSocket未就绪，不发送数据到医生端");
    }
    
    return calibrationInfo;
  } catch (error) {
    console.error('[PRESSURE] 获取校准数据并发送失败:', error);
    throw error;
  }
  }
})