// pages/device/device.js
import bleManager from '../../utils/ble-manager';

Page({
  data: {
    deviceName: '',
    isConnected: false,
    isPaired: false,
    isVerified: false,
    deviceInfo: null, // 设备信息
    deviceConfig: null, // 设备配置
    activeTab: 'info', // 当前活动标签: info, config, commands, data, advanced，calibrationInfo
    calibrationInfo: null, //校准数据

    // 配置表单
    configForm: {
      samplingInterval: 1,
      pressureMax: 1000,
      pressureMin: 0
    },

    // 命令状态
    commandStatus: {
      syncTime: {
        status: 'idle',
        message: ''
      },
      requestData: {
        status: 'idle',
        message: ''
      },
      clearData: {
        status: 'idle',
        message: ''
      },
      unpairDevice: {
        status: 'idle',
        message: ''
      },
      factoryReset: {
        status: 'idle',
        message: ''
      },
      updateConfig: {
        status: 'idle',
        message: ''
      }
    },

    // 日志记录
    logs: [],

    // 数据记录
    dataRecords: [],

    // 传输状态
    transferStatus: {
      inProgress: false,
      totalPackets: 0,
      totalRecords: 0,
      currentPacket: 0,
    }
  },

  onLoad() {
    // 设置设备信息
    const secStatus = bleManager.getSecurityStatus();

    this.setData({
      deviceName: bleManager.deviceName || '未知设备',
      isConnected: bleManager.isConnected,
      isPaired: secStatus.isPaired,
      isVerified: secStatus.isVerified
    });

    // 注册蓝牙回调
    this.registerBLECallbacks();

    if (this.data.isVerified) {
      // 读取设备信息
      this.readDeviceInfo();
      // 读取设备配置
      this.readDeviceConfig();
    }
  },

  onShow() {
    // 确保回调被正确注册
    this.registerBLECallbacks();
  },

  onHide() {
    // 页面隐藏时清理回调，防止干扰其他页面
    this.unregisterBLECallbacks();
  },

  // 注册BLE回调
  // 命令响应回调处理
  registerBLECallbacks() {
    console.log('[DEVICE] 注册蓝牙回调');

    // 命令响应回调 - 处理各种响应类型
    bleManager.registerCallback('onCommandResponse', (response) => {
      console.log('[DEVICE] 收到命令响应:', response.type, response);

      // 根据响应类型分发处理
      switch (response.type) {
        case 'INFO_READ':
          this.handleDeviceInfoResponse(response);
          break;

        case 'CONFIG_READ':
          this.handleConfigReadResponse(response);
          break;

        case 'SYNC_TIME':
        case 'CLEAR_ALL':
        case 'UNPAIR_DEVICE':
        case 'FACTORY_RESET':
          this.handleCommandStatusResponse(response);
          break;

        case 'START_TRANS':
          this.handleTransferStartResponse(response);
          break;

        case 'DATA_PACK':
          this.handleDataPackResponse(response);
          break;
        case 'CALIB_RES':
          this.handCalibrationResponse(response);
          break;
        default:
          console.log('[DEVICE] 未处理的响应类型:', response.type);
      }
    });

    // 其他回调注册...
    // 数据传输完成回调
    bleManager.registerCallback('onTransferCompleted', this.handleTransferCompleted.bind(this));

    // 断开连接回调
    bleManager.registerCallback('onDisconnected', this.handleDeviceDisconnected.bind(this));

    // 错误回调
    bleManager.registerCallback('onError', this.handleError.bind(this));
  },

  // 处理设备信息响应
  handleDeviceInfoResponse(response) {
    if (!response.success || !response.deviceInfo) return;

    console.log('[DEVICE] 处理设备信息:', response.deviceInfo);

    // 格式化存储空间显示
    const freeMB = (response.deviceInfo.storageFree / 1024).toFixed(1);
    const totalMB = (response.deviceInfo.storageTotal / 1024).toFixed(1);

    // 格式化时间显示
    let formattedTime = '未同步';
    if (response.deviceInfo.savedTime) {
      formattedTime = this.formatTimestamp(response.deviceInfo.savedTime);
    }

    // 准备更新的设备信息
    const updatedDeviceInfo = {
      ...response.deviceInfo,
      storageDisplay: `${freeMB} KB / ${totalMB} KB`,
      formattedTime: formattedTime
    };

    // 更新UI
    this.setData({
      deviceInfo: updatedDeviceInfo,
      isPaired: response.deviceInfo.isPaired || false
    });

    this.addLog('信息', `接收设备信息: ID=${response.deviceInfo.deviceId}, 固件=${response.deviceInfo.firmwareVersion}`);
  },

  // 处理配置读取响应
  handleConfigReadResponse(response) {
    if (!response.success || !response.config) return;

    console.log('[DEVICE] 处理配置信息:', response.config);

    // 配置表单数据只包含三个实际字段
    const configForm = {
      samplingInterval: response.config.samplingInterval || 1,
      pressureMax: response.config.pressureMax || 1000,
      pressureMin: response.config.pressureMin || 0
    };

    // 更新UI
    this.setData({
      deviceConfig: response.config,
      configForm: configForm
    });

    console.log('[DEVICE] 配置表单已更新:', configForm);
    this.addLog('配置', `设备配置: 采样间隔=${configForm.samplingInterval}分钟, 压力范围=${configForm.pressureMin}-${configForm.pressureMax}`);
  },

  // 处理命令状态响应
  handleCommandStatusResponse(response) {
    const commandStatusMap = {
      'SYNC_TIME': 'syncTime',
      'CLEAR_ALL': 'clearData',
      'UNPAIR_DEVICE': 'unpairDevice',
      'FACTORY_RESET': 'factoryReset'
    };

    const messageMap = {
      'SYNC_TIME': '时间同步',
      'CLEAR_ALL': '数据已清除',
      'UNPAIR_DEVICE': '解除配对',
      'FACTORY_RESET': '重置'
    };

    const statusKey = commandStatusMap[response.type];
    const messagePrefix = messageMap[response.type];

    if (statusKey) {
      this.setData({
        [`commandStatus.${statusKey}`]: {
          status: response.success ? 'success' : 'error',
          message: response.success ? `${messagePrefix}成功` : `${messagePrefix}失败`
        }
      });
      console.log(`[DEVICE] ${messagePrefix}命令结果:`, response.success ? '成功' : '失败');
    }
  },

  // 处理传输开始响应
  handleTransferStartResponse(response) {
    if (!response.success) return;

    // 更新传输状态
    this.setData({
      transferStatus: {
        inProgress: true,
        totalRecords: response.totalRecords,
        currentPacket: 0,
        totalPackets: response.totalPackets
      },
      'commandStatus.requestData': {
        status: 'sent',
        message: '正在接收数据...'
      }
    });
    console.log('[DEVICE] 数据传输开始，总记录数:', response.totalRecords);
    console.log('[DEVICE] 数据传输开始，总记录数:', response.totalRecords);
  },

  // 处理数据包响应
  handleDataPackResponse(response) {
    if (!response.success) return;

    // 更新传输进度状态
    this.setData({
      transferStatus: {
        inProgress: true,
        totalPackets: this.data.transferStatus.totalPackets, // 保留原值
        totalRecords: this.data.transferStatus.totalRecords, // 保留原值
        currentPacket: response.currentPacket
      }
    });
    console.log('[DEVICE] 数据中，当前包:', response.currentPacket);
    this.addLog('数据', `接收数据包 ${response.currentPacket}/${response.totalPackets}`);
  },
  handCalibrationResponse(response) {
    if (!response.success) return;

    // 更新传输进度状态
    this.setData({
      calibrationInfo: {
        
        timestamp: this.formatTime(response.calibrationInfo.timestamp),
        pressure1: response.calibrationInfo.pressure1.toFixed(2),
        pressure2: response.calibrationInfo.pressure2.toFixed(2),
        pressure3: response.calibrationInfo.pressure3.toFixed(2),
      }
    });
    console.log('[DEVICE] 校准完成');
    this.addLog('数据', '校准完成');
  },
  // 处理传输完成
  handleTransferCompleted(data) {
    console.log('[DEVICE] 数据传输完成，共接收记录:', data.records.length);
    this.addLog('数据', `数据传输完成，接收 ${data.records.length} 条记录`);

    // 处理和格式化数据记录
    const processedRecords = data.records.map(record => {
      if (!record) return null;

      try {
        return {
          timestamp: record.timestamp,
          formattedTime: this.formatTime(record.timestamp),
          pressure1: typeof record.pressure1 === 'number' ? record.pressure1.toFixed(2) : null,
          pressure2: typeof record.pressure2 === 'number' ? record.pressure2.toFixed(2) : null,
          pressure3: typeof record.pressure3 === 'number' ? record.pressure3.toFixed(2) : null
        };
      } catch (err) {
        console.error('[DEVICE] 处理记录时出错:', err, record);
        return null;
      }
    }).filter(record => record !== null);

    console.log('[DEVICE] 处理后的记录数:', processedRecords.length);

    if (processedRecords.length > 0) {
      this.setData({
        dataRecords: processedRecords.slice(-20),
        transferStatus: {
          inProgress: false,
          totalRecords: data.totalRecords || 0,
          currentPacket: 0
        },
        'commandStatus.requestData': {
          status: 'success',
          message: '数据传输完成'
        }
      });
    } else {
      this.setData({
        transferStatus: {
          inProgress: false,
          totalRecords: 0,
          currentPacket: 0
        },
        'commandStatus.requestData': {
          status: 'success',
          message: '没有新数据'
        }
      });
    }

    if (this.data.activeTab === 'data') {
      console.log('[DEVICE] 数据页面已更新:', this.data.dataRecords);
    }
  },

  // 处理设备断开连接
  handleDeviceDisconnected(data) {
    console.log('[DEVICE] 断开连接回调:', data);

    this.setData({
      isConnected: false,
      isPaired: false,
      isVerified: false
    });

    wx.showModal({
      title: '连接已断开',
      content: '设备连接已断开，请返回首页重新连接',
      showCancel: false,
      success: (res) => {
        wx.navigateBack();
      }
    });
  },

  // 处理错误
  handleError(error) {
    console.error('[DEVICE] 收到错误:', error.code, error.message);
    this.addLog('错误', error.message);

    wx.showToast({
      title: error.message,
      icon: 'none',
      duration: 2000
    });
  },

  // 取消注册BLE回调
  unregisterBLECallbacks() {
    console.log('[DEVICE] 取消注册蓝牙回调');

    // 取消注册所有回调
    bleManager.registerCallback('onCharacteristicChanged', null);
    bleManager.registerCallback('onTransferCompleted', null);
    bleManager.registerCallback('onVerified', null);
    bleManager.registerCallback('onPaired', null);
    bleManager.registerCallback('onDisconnected', null);
    bleManager.registerCallback('onError', null);
    bleManager.registerCallback('onCommandResponse', null);
  },

  // 读取设备信息
  readDeviceInfo() {
    this.addLog('操作', '读取设备信息');
    bleManager.readDeviceInfo()
      .catch(err => this.addLog('错误', '读取设备信息失败'));
  },

  // 读取设备配置
  readDeviceConfig() {
    this.addLog('操作', '读取设备配置');
    bleManager.readDeviceConfig()
      .catch(err => this.addLog('错误', '读取设备配置失败'));
  },
  //获取校准数据
  getCalibrationInfo() {
    this.addLog('操作', '校准数据');
    bleManager.getCalibrationInfo()
      .catch(err => this.addLog('错误', '获取校准数据失败'));
  },

  // ===== UI交互方法 =====

  // 切换标签页
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab
    });

    // 如果切换到数据记录页面，自动刷新传输状态
    if (tab === 'data') {
      const status = bleManager.getTransferStatus();
      this.setData({
        transferStatus: {
          inProgress: status.inProgress,
          totalPackets: status.totalPackets,
          currentPacket: status.currentPacket
        }
      });
    }
  },

  // 更新配置输入
  onConfigInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;

    this.setData({
      [`configForm.${field}`]: value
    });
  },

  // 提交配置
  submitConfig() {

    const {
      samplingInterval,
      pressureMax,
      pressureMin
    } = this.data.configForm;

    // 检查必要的值
    console.log("配置值:", samplingInterval, pressureMax, pressureMin);

    // if (sampleInterval < 1 || uploadInterval < 1) {
    //   wx.showToast({
    //     title: '间隔时间必须大于0',
    //     icon: 'none'
    //   });
    //   return;
    // }

    // 检查安全验证状态
    // if (!this.data.isVerified && this.data.isPaired) {
    //   wx.showToast({
    //     title: '请等待安全验证完成',
    //     icon: 'none'
    //   });
    //   return;
    // }

    this.addLog('操作', '更新设备配置');

    // 更新命令状态
    this.setData({
      'commandStatus.updateConfig': {
        status: 'pending',
        message: '更新配置中...'
      }
    });

    // 调用BLE管理器更新配置
    bleManager.updateConfig({
      samplingInterval: parseInt(samplingInterval),
      pressureMax: parseInt(pressureMax),
      pressureMin: parseInt(pressureMin)
    }).then(success => {
      if (success) {
        this.setData({
          'commandStatus.updateConfig': {
            status: 'success',
            message: '配置已更新'
          }
        });

        wx.showToast({
          title: '配置已更新'
        });
      } else {
        this.setData({
          'commandStatus.updateConfig': {
            status: 'error',
            message: '更新失败'
          }
        });
      }
    });
  },

  // 同步时间
  syncTime() {
    // 检查安全验证状态
    if (!this.data.isVerified && this.data.isPaired) {
      wx.showToast({
        title: '请等待安全验证完成',
        icon: 'none'
      });
      return;
    }

    this.addLog('操作', '同步时间');

    // 更新命令状态
    this.setData({
      'commandStatus.syncTime': {
        status: 'pending',
        message: '同步中...'
      }
    });

    bleManager.syncTime().then(success => {
      if (success) {
        this.setData({
          'commandStatus.syncTime': {
            status: 'sent',
            message: '命令已发送'
          }
        });

        wx.showToast({
          title: '同步命令已发送'
        });
      } else {
        this.setData({
          'commandStatus.syncTime': {
            status: 'error',
            message: '发送失败'
          }
        });
      }
    });
  },

  // 请求数据
  requestData() {
    // 检查安全验证状态
    if (!this.data.isVerified && this.data.isPaired) {
      wx.showToast({
        title: '请等待安全验证完成',
        icon: 'none'
      });
      return;
    }

    this.addLog('操作', '请求数据');

    // 更新命令状态
    this.setData({
      'commandStatus.requestData': {
        status: 'pending',
        message: '请求中...'
      }
    });

    // 重置数据传输状态
    this.setData({
      dataRecords: [],
      transferStatus: {
        inProgress: true,
        totalPackets: 0,
        currentPacket: 0
      }
    });

    bleManager.requestData().then(success => {
      if (success) {
        this.setData({
          'commandStatus.requestData': {
            status: 'sent',
            message: '命令已发送'
          }
        });

        this.addLog('操作', '请求数据命令已发送');

        // 如果当前不在数据页面，自动切换
        if (this.data.activeTab !== 'data') {
          this.setData({
            activeTab: 'data'
          });
        }
      } else {
        this.setData({
          'commandStatus.requestData': {
            status: 'error',
            message: '发送失败'
          }
        });
      }
    });
  },

  // 清除数据
  clearData() {
    // 检查安全验证状态
    if (!this.data.isVerified && this.data.isPaired) {
      wx.showToast({
        title: '请等待安全验证完成',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认操作',
      content: '确定要清除所有数据吗？此操作不可恢复！',
      success: (res) => {
        if (res.confirm) {
          this.addLog('操作', '清除所有数据');

          // 更新命令状态
          this.setData({
            'commandStatus.clearData': {
              status: 'pending',
              message: '清除中...'
            }
          });

          bleManager.clearData().then(success => {
            if (success) {
              this.setData({
                'commandStatus.clearData': {
                  status: 'sent',
                  message: '命令已发送'
                }
              });

              wx.showToast({
                title: '清除命令已发送'
              });
            } else {
              this.setData({
                'commandStatus.clearData': {
                  status: 'error',
                  message: '发送失败'
                }
              });
            }
          });
        }
      }
    });
  },

  // 解除配对
  unpairDevice() {
    // 检查安全验证状态
    if (!this.data.isVerified && this.data.isPaired) {
      wx.showToast({
        title: '请等待安全验证完成',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认操作',
      content: '确定要解除设备配对吗？需要重新配对才能继续使用',
      success: (res) => {
        if (res.confirm) {
          this.addLog('操作', '解除设备配对');

          // 更新命令状态
          this.setData({
            'commandStatus.unpairDevice': {
              status: 'pending',
              message: '解除配对中...'
            }
          });

          bleManager.unpairDevice().then(success => {
            if (success) {
              this.setData({
                'commandStatus.unpairDevice': {
                  status: 'sent',
                  message: '命令已发送'
                }
              });

              wx.showToast({
                title: '解除配对命令已发送'
              });
            } else {
              this.setData({
                'commandStatus.unpairDevice': {
                  status: 'error',
                  message: '发送失败'
                }
              });
            }
          });
        }
      }
    });
  },

  // 工厂重置
  factoryReset() {
    // 检查安全验证状态
    if (!this.data.isVerified && this.data.isPaired) {
      wx.showToast({
        title: '请等待安全验证完成',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认操作',
      content: '确定要恢复出厂设置吗？所有数据和配置将被清除！',
      success: (res) => {
        if (res.confirm) {
          this.addLog('操作', '执行工厂重置');

          // 更新命令状态
          this.setData({
            'commandStatus.factoryReset': {
              status: 'pending',
              message: '重置中...'
            }
          });

          bleManager.factoryReset().then(success => {
            if (success) {
              this.setData({
                'commandStatus.factoryReset': {
                  status: 'sent',
                  message: '命令已发送'
                }
              });

              wx.showToast({
                title: '重置命令已发送'
              });
            } else {
              this.setData({
                'commandStatus.factoryReset': {
                  status: 'error',
                  message: '发送失败'
                }
              });
            }
          });
        }
      }
    });
  },
  // 格式化时间戳为简短格式
  formatTime(timestamp) {
    if (!timestamp) return '-';

    const date = new Date(timestamp); // 如果 timestamp 是毫秒制，这一步已经足够
    date.setHours(date.getHours() + 8); // 调整为 UTC+8 时区

    const year = date.getFullYear().toString().padStart(4, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },

  // 格式化时间戳为完整格式（中国时区）
  formatTimestamp(timestamp) {
    if (!timestamp) return '-';

    // 如果时间戳是秒级的，转换为毫秒级
    if (timestamp < 10000000000) {
      timestamp *= 1000;
    }

    // 创建一个新的Date对象
    const date = new Date(timestamp);

    // 将时间调整为北京时间（UTC+8）
    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai'
    });
  },
  // 添加日志
  addLog(type, message) {
    const logs = this.data.logs;
    logs.unshift({
      time: new Date().toLocaleTimeString(),
      type,
      message
    });

    // 最多保留50条日志
    if (logs.length > 50) {
      logs.pop();
    }

    this.setData({
      logs
    });
  },

  // 清空日志
  clearLogs() {
    this.setData({
      logs: []
    });
  },

  // 页面卸载时清理
  onUnload() {
    console.log('[DEVICE] 页面卸载，清理回调');

    // 取消注册蓝牙回调，防止内存泄漏
    this.unregisterBLECallbacks();
  }
})