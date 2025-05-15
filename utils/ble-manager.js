// utils/ble-manager.js

/**
 * BLE管理器类
 * 负责处理蓝牙设备连接、通信和配对管理
 * 更新：添加ESP32C6安全机制支持和新的响应处理机制
 */
class BLEManager {
  constructor() {
    this.isInitialized = false;
    this.isScanning = false;
    this.isConnected = false;
    this.isPaired = false;
    this.isVerified = false;

    this.deviceId = '';
    this.deviceName = '';
    this.serviceId = '';

    // 服务和特征值UUID - 与ESP32匹配
    this.SERVICE_UUID = "0000ABC0-0000-1000-8000-00805F9B34FB";
    this.INFO_CHAR_UUID = "0000ABC1-0000-1000-8000-00805F9B34FB";
    this.CONFIG_CHAR_UUID = "0000ABC2-0000-1000-8000-00805F9B34FB";
    this.DATA_CHAR_UUID = "0000ABC3-0000-1000-8000-00805F9B34FB";
    this.CONTROL_CHAR_UUID = "0000ABC4-0000-1000-8000-00805F9B34FB";

    // 命令定义 - 与ESP32匹配（已更新）
    this.Commands = {
      SYNC_TIME: 0x01, // 同步时间，参数：时间戳(8字节)
      START_TRANS: 0x02, // 开始传输，参数：起始时间戳(8字节)
      DATA_PACKET: 0x03, // 数据包请求，参数：包序号(2字节)
      DELETE_RANGE: 0x05, // 按时间范围删除，参数：日期时间戳(8字节)
      CLEAR_ALL: 0x06, // 清除所有数据
      FACTORY_RESET: 0x07, // 工厂重置，参数：确认码(4字节)
      UNPAIR_DEVICE: 0x08, // 取消配对，参数：确认码(4字节)
      GET_ONE_SAMPLING : 0x09  //获取一次采样数据

      
    };

    // 响应类型 - 与ESP32匹配（新增）
    this.ResponseTypes = {
      SYNC_COMPLETE: 0x01, // 同步完成响应
      PACKET_HEADER: 0x02, // 包头响应
      PACKET_DATA: 0x03, // 数据包响应
      COMPLETELY_DATA: 0x04, // 传输完成响应
      DELETE_COMPLETE: 0x05, // 删除完成响应
      CLEAR_COMPLETE: 0x06, // 清除完成响应
      FACTORY_COMPLETE: 0x07, // 工厂重置完成响应
      UNPAIR_COMPLETE: 0x08, // 取消配对完成响应
      RES_ONE_SAMPLING:0x9,  //返回一次采样数据
      AUTH_SUCCESS: 0x010 // 验证成功响应
    };

    // 成功/失败标志
    this.StatusFlag = {
      SUCCESS: 0x01, // 操作成功
      FAILURE: 0xFF // 操作失败
    };

    // 安全相关常量
    this.SECURITY_TIMEOUT = 30000; // 安全验证超时(毫秒)  30s 需要手动输入密码 时间太短不够
    this.CONNECTION_TIMEOUT = 60000; // 连接超时(毫秒)  60s
    this.TRANSFER_TIMEOUT = 30000; // 传输超时(毫秒)  30s
    this.FACTORY_RESET_CODE = 0xA5B6C7D8; // 工厂重置确认码

    // 特征值UUID
    this.characteristicIds = {
      info: '', // 信息特征值
      config: '', // 配置特征值
      data: '', // 数据特征值
      control: '' // 控制特征值
    };

    // 计时器
    this._securityTimer = null; // 安全验证超时计时器
    this._connectionTimer = null; // 连接超时计时器
    this._transferTimer = null; // 传输超时计时器
    this._lastActivityTime = 0; // 最后活动时间

    // 回调函数
    this.callbacks = {
      onDeviceFound: null, // 发现设备回调
      onConnected: null, // 连接成功回调
      onDisconnected: null, // 断开连接回调
      onCharacteristicChanged: null, // 特征值变化回调
      onError: null, // 错误回调
      onPaired: null, // 配对成功回调
      onVerified: null, // 验证成功回调
      onTransferCompleted: null, // 数据传输完成回调
      onCommandResponse: null // 命令响应回调（新增）
    };


    // 传输状态
    this.transferStatus = {
      inProgress: false,
      startTime: 0,
      totalPackets: 0,
      currentPacket: 0,
      records: []
    };

    // 监听蓝牙适配器状态变化
    wx.onBluetoothAdapterStateChange(this._onBluetoothAdapterStateChange.bind(this));

    // 监听设备连接状态变化
    wx.onBLEConnectionStateChange(this._onBLEConnectionStateChange.bind(this));

    // 监听特征值变化
    wx.onBLECharacteristicValueChange(this._onBLECharacteristicValueChange.bind(this));

    // 加载保存的设备信息
    this._loadSavedDeviceInfo();
  }

  /**
   * 初始化蓝牙适配器
   * @returns {Promise<boolean>} 是否成功初始化
   */
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      await wx.openBluetoothAdapter();
      this.isInitialized = true;
      console.log('[BLE] 蓝牙适配器初始化成功');
      return true;
    } catch (error) {
      console.error('[BLE] 蓝牙适配器初始化失败:', error);
      this._triggerCallback('onError', {
        code: 'INIT_FAILED',
        message: '蓝牙初始化失败, 请确保蓝牙已开启',
        error
      });
      return false;
    }
  }

  /**
   * 开始扫描设备
   * @param {Object} options 扫描选项
   * @param {boolean} options.onlyESP32 是否只查找ESP32设备
   * @returns {Promise<boolean>} 是否成功开始扫描
   */
  async startScan(options = {
    onlyESP32: true
  }) {
    if (this.isScanning) {
      return true;
    }

    // 先初始化
    if (!this.isInitialized && !(await this.initialize())) {
      return false;
    }

    try {
      // 重置发现的设备列表
      this.discoveredDevices = [];

      // 开始扫描
      await wx.startBluetoothDevicesDiscovery({
        allowDuplicatesKey: false,
        services: [this.SERVICE_UUID] // 只扫描具有我们服务的设备
      });

      this.isScanning = true;
      this.scanOptions = options;

      // 监听设备发现事件
      wx.onBluetoothDeviceFound((res) => {
        res.devices.forEach(device => {
          // 忽略没有名称的设备
          if (!device.name && !device.localName) {
            return;
          }

          // 判断是否符合过滤条件
          const isESP32 = this._isESP32Device(device);
          if (options.onlyESP32 && !isESP32) {
            return;
          }

          // 添加设备到列表
          const enhancedDevice = {
            ...device,
            isESP32,
            isPaired: device.deviceId === this.deviceId,
            isConnected: device.deviceId === this.deviceId && this.isConnected
          };

          // 检查是否已经在列表中
          const index = this.discoveredDevices.findIndex(d => d.deviceId === device.deviceId);
          if (index === -1) {
            console.log("[BLE] scan device not in list")
            this.discoveredDevices.push(enhancedDevice);
          } else {
            console.log("[BLE] scan device in list")
            this.discoveredDevices[index] = enhancedDevice;
          }

          // 触发回调
          this._triggerCallback('onDeviceFound', this.discoveredDevices);
        });
      });

      console.log('[BLE] 开始扫描设备');
      return true;
    } catch (error) {
      console.error('[BLE] 扫描失败:', error);
      this._triggerCallback('onError', {
        code: 'SCAN_FAILED',
        message: '扫描设备失败',
        error
      });
      return false;
    }
  }

  /**
   * 停止扫描设备
   * @returns {Promise<boolean>} 是否成功停止扫描
   */
  async stopScan() {
    if (!this.isScanning) {
      return true;
    }

    try {
      this.isScanning = false;

      wx.stopBluetoothDevicesDiscovery({
        success(res) {
          // console.log(res)
        }
      })
      return true;
    } catch (error) {
      console.error('[BLE] 停止扫描失败:', error);
      this._triggerCallback('onError', {
        code: 'SCAN_FAILED',
        message: '停止扫描设备失败',
        error
      });
      return false;
    }
  }

  /**
   * 尝试连接已保存的设备
   * @returns {Promise<boolean>} 是否成功连接
   */
  async connectSavedDevice() {
    if (!this.deviceId) {
      console.log('[BLE] 没有已保存的设备');
      return false;
    }

    const result = await this.connectDevice(this.deviceId, this.deviceName);
    return result;
  }

  /**
   * 连接设备
   * @param {string} deviceId 设备ID
   * @param {string} deviceName 设备名称
   * @returns {Promise<boolean>} 是否成功连接
   */
  async connectDevice(deviceId, deviceName = '') {
    // 如果设备已连接，先断开
    if (this.isConnected) {
      await this.disconnectDevice();
    }

    try {
      // 停止扫描
      if (this.isScanning) {
        await this.stopScan();
      }

      console.log(`[BLE] 开始连接设备: ${deviceId}`);

      // 创建连接
      await wx.createBLEConnection({
        deviceId
      });

      // 更新状态
      this.isConnected = true;
      this.isVerified = false; // 连接时重置验证状态
      this.deviceId = deviceId;
      this.deviceName = deviceName || 'Unknown Device';



      // 保存设备信息
      this._saveDeviceInfo();
      // 获取服务和特征值，添加超时处理

      let servicesSuccess = false;
      try {
        servicesSuccess = await Promise.race([
          this._getDeviceServices(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('获取服务超时')), 10000)
          )
        ]);

        if (!servicesSuccess) {
          throw new Error('获取设备服务失败');
        }

        console.log('[BLE] 服务和特征值获取成功');
      } catch (error) {
        console.error('[BLE] 获取服务或特征值失败:', error);
        await wx.closeBLEConnection({
          deviceId
        });
        this.isConnected = false;
        throw error;
      }

      // 将setBLEMTU转为Promise形式调用
      await new Promise((resolve, reject) => {
        wx.setBLEMTU({
          deviceId: deviceId,
          mtu: 512,
          success(res) {
            console.log("MTU 设置成功:", res.mtu);
            resolve(res);
          },
          fail(err) {
            console.error("MTU 设置失败:", err);
            // 即使MTU设置失败，也继续流程，而不是中断
            resolve(false); // 或者使用reject(err)如果要中断流程
          }
        });
      });

      // 启动安全验证超时计时器
      this._startSecurityTimer();

      // 更新最后活动时间
      this._updateLastActivityTime();
      console.log(`[BLE] 物理连接成功: ${this.deviceName}`);
      // 触发回调
      this._triggerCallback('onConnected', {
        deviceId: this.deviceId,
        deviceName: this.deviceName
      });

      return true;
    } catch (error) {
      console.error('[BLE] 连接设备失败:', error);
      // 确保状态正确
      this.isConnected = false;
      this.isVerified = false;

      this._triggerCallback('onError', {
        code: 'CONNECT_FAILED',
        message: '连接设备失败: ' + error.message,
        error
      });
      return false;
    }
  }

  /**
   * 断开设备连接
   * @returns {Promise<boolean>} 是否成功断开连接
   */
  async disconnectDevice() {
    if (!this.isConnected) {
      getApp().globalData.connectedDevice = null;
      wx.removeStorageSync('connectedDevice');
      return true;
    }

    try {
      // 清除所有计时器
      this._clearAllTimers();

      await wx.closeBLEConnection({
        deviceId: this.deviceId
      });

      // 状态会在onBLEConnectionStateChange回调中更新
      // 这里不更新状态，避免状态不一致
      getApp().globalData.connectedDevice = null;
      wx.removeStorageSync('connectedDevice');
      return true;
    } catch (error) {
      console.error('[BLE] 断开连接失败:', error);
      // 如果断开失败，强制更新状态
      this.isConnected = false;
      this.isVerified = false;
      getApp().globalData.connectedDevice = null;
      wx.removeStorageSync('connectedDevice');
      this._triggerCallback('onDisconnected', {
        deviceId: this.deviceId
      });
      return false;
    }
  }


  /**
   * 同步时间
   * @returns {Promise<boolean>} 是否成功发送同步时间命令
   */
  async syncTime() {
    // 验证操作条件
    if (!this._verifyOperationConditions()) {
      return false;
    }

    try {
      // 获取当前秒级时间戳
      const now = Math.floor(Date.now() / 1000);
      const buffer = new ArrayBuffer(9); // 命令(1字节) + 时间戳(8字节)
      const dataView = new DataView(buffer);

      // 设置命令 - SYNC_TIME
      dataView.setUint8(0, this.Commands.SYNC_TIME);

      // 设置时间戳（低32位和高32位）
      const low = now % 4294967296; // 低32位
      const high = Math.floor(now / 4294967296); // 高32位
      dataView.setUint32(1, low, true); // 小端序
      dataView.setUint32(5, high, true); // 小端序

      // 发送命令
      return await this._sendBLECommand(buffer);
    } catch (error) {
      console.error('[BLE] 同步时间命令发送失败:', error);
      this._triggerCallback('onError', {
        code: 'SYNC_TIME_FAILED',
        message: '同步时间失败',
        error
      });
      return false;
    }
  }

  /**
   * 请求数据
   * @param {number} startTime 起始时间戳(秒)，默认为24小时前
   * @returns {Promise<boolean>} 是否成功发送请求数据命令
   */
  async requestData(startTime = Math.floor(Date.now() / 1000) - 24 * 60 * 60) {
    // 验证操作条件
    if (!this._verifyOperationConditions()) {
      return false;
    }

    try {
      // 清空当前传输状态和数据
      this.transferStatus = {
        inProgress: false,
        startTime: 0,
        totalPackets: 0,
        currentPacket: 0,
        records: []
      };

      // 构建请求数据命令
      const buffer = new ArrayBuffer(9); // 命令(1字节) + 时间戳(8字节)
      const dataView = new DataView(buffer);

      // 设置命令 - START_TRANS
      dataView.setUint8(0, this.Commands.START_TRANS);

      // 设置时间戳(低32位和高32位) - 注意这里使用秒级时间戳
      const low = startTime % 4294967296;
      const high = Math.floor(startTime / 4294967296);
      dataView.setUint32(1, low, true); // 小端序
      dataView.setUint32(5, high, true); // 小端序

      console.log('[BLE] 请求数据命令发送，起始时间:', startTime, '秒 (', new Date(startTime * 1000).toLocaleString(), ')');

      // 发送命令
      return await this._sendBLECommand(buffer);
    } catch (error) {
      console.error('[BLE] 请求数据命令发送失败:', error);
      this._triggerCallback('onError', {
        code: 'REQUEST_DATA_FAILED',
        message: '请求数据失败',
        error
      });
      return false;
    }
  }

  /**
   * 请求特定数据包
   * @param {number} packetNum 包序号
   * @returns {Promise<boolean>} 是否成功请求数据包
   */
  async requestDataPacket(packetNum) {
    if (!this.isConnected || !this.transferStatus.inProgress) {
      console.error('[BLE] 没有正在进行的数据传输');
      return false;
    }

    try {
      // 构建请求数据包命令
      const buffer = new ArrayBuffer(3); // 命令(1字节) + 包序号(2字节)
      const dataView = new DataView(buffer);

      // 设置命令 - DATA_PACKET
      dataView.setUint8(0, this.Commands.DATA_PACKET);

      // 设置包序号
      dataView.setUint16(1, packetNum, true); // 小端序

      // 发送命令
      return await this._sendBLECommand(buffer);
    } catch (error) {
      console.error(`[BLE] 请求数据包 ${packetNum} 命令发送失败:`, error);
      return false;
    }
  }

  /**
   * 清除数据
   * @returns {Promise<boolean>} 是否成功发送清除数据命令
   */
  async clearData() {
    // 验证操作条件
    if (!this._verifyOperationConditions()) {
      return false;
    }

    try {
      // 构建清除数据命令
      const buffer = new ArrayBuffer(5); // 命令(1字节) + 确认码(4字节)
      const dataView = new DataView(buffer);

      // 设置命令 - CLEAR_ALL
      dataView.setUint8(0, this.Commands.CLEAR_ALL);
      // 设置确认码
      dataView.setUint32(1, this.FACTORY_RESET_CODE, true); // 小端序

      // 发送命令
      return await this._sendBLECommand(buffer);
    } catch (error) {
      console.error('[BLE] 清除数据命令发送失败:', error);
      this._triggerCallback('onError', {
        code: 'CLEAR_DATA_FAILED',
        message: '清除数据失败',
        error
      });
      return false;
    }
  }

  /**
   * 取消配对
   * @returns {Promise<boolean>} 是否成功发送解除配对命令
   */
  async unpairDevice() {
    // 验证操作条件
    if (!this._verifyOperationConditions()) {
      return false;
    }

    try {
      // 构建解除配对命令
      const buffer = new ArrayBuffer(5); // 命令(1字节) + 确认码(4字节)
      const dataView = new DataView(buffer);

      // 设置命令 - UNPAIR_DEVICE
      dataView.setUint8(0, this.Commands.UNPAIR_DEVICE);
      // 设置确认码
      dataView.setUint32(1, this.FACTORY_RESET_CODE, true); // 小端序

      // 发送命令
      return await this._sendBLECommand(buffer);
    } catch (error) {
      console.error('[BLE] 解除配对命令发送失败:', error);
      this._triggerCallback('onError', {
        code: 'UNPAIR_FAILED',
        message: '解除配对失败',
        error
      });
      return false;
    }
  }

  /**
   * 工厂重置
   * @returns {Promise<boolean>} 是否成功发送工厂重置命令
   */
  async factoryReset() {
    // 验证操作条件
    if (!this._verifyOperationConditions()) {
      return false;
    }

    try {
      // 构建工厂重置命令
      const buffer = new ArrayBuffer(5); // 命令(1字节) + 确认码(4字节)
      const dataView = new DataView(buffer);

      // 设置命令 - FACTORY_RESET
      dataView.setUint8(0, this.Commands.FACTORY_RESET);

      // 设置确认码
      dataView.setUint32(1, this.FACTORY_RESET_CODE, true); // 小端序

      // 发送命令
      return await this._sendBLECommand(buffer); //这个命令会发送失败
    } catch (error) {
      console.error('[BLE] 工厂重置命令发送失败:', error);
      this._triggerCallback('onError', {
        code: 'FACTORY_RESET_FAILED',
        message: '工厂重置失败',
        error
      });
      return false;
    }
  }

  /**
   * 读取设备信息，用于检查配对状态
   * @returns {Promise<boolean>} 是否成功发送读取信息命令
   */
  async readDeviceInfo() {
    if (!this._verifyOperationConditions(this.characteristicIds.info)) {
      return false;
    }

    try {
      // 更新最后活动时间
      this._updateLastActivityTime();

      console.log('[BLE] 发送读取设备信息请求:',
        this.deviceId, this.serviceId, this.characteristicIds.info);

      // 发送读取命令
      await wx.readBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.characteristicIds.info
      });

      console.log('[BLE] 读取设备信息命令发送成功');
      return true;
    } catch (error) {
      console.error('[BLE] 读取设备信息命令发送失败:', error);
      this._triggerCallback('onError', {
        code: 'READ_INFO_FAILED',
        message: '读取设备信息失败: ' + error.message,
        error
      });
      return false;
    }
  }

  /**
   * 更新配置
   * @param {Object} config 配置对象
   * @param {number} config.samplingInterval 采样间隔(分钟)
   * @param {number} config.pressureMax 压力上限
   * @param {number} config.pressureMin 压力下限
   * @returns {Promise<boolean>} 是否成功发送更新配置命令
   */
  async updateConfig(config) {
    if (!this._verifyOperationConditions(this.characteristicIds.config)) {
      return false;
    }

    try {
      // 更新最后活动时间
      this._updateLastActivityTime();

      // 构建配置数据 (按DeviceConfig结构)
      const buffer = new ArrayBuffer(8); // 配置结构体大小
      const dataView = new DataView(buffer);

      // 设置各项配置
      dataView.setUint8(0, config.samplingInterval || 1); // 采样间隔(分钟)
      dataView.setUint16(1, config.pressureMax || 1000, true); // 压力上限
      dataView.setUint16(3, config.pressureMin || 0, true); // 压力下限
      // 剩余3字节是保留字节，设为0
      dataView.setUint8(5, 0);
      dataView.setUint8(6, 0);
      dataView.setUint8(7, 0);

      // 发送配置
      await wx.writeBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.characteristicIds.config,
        value: buffer
      });

      console.log('[BLE] 更新配置成功:', config);
      return true;
    } catch (error) {
      console.error('[BLE] 更新配置失败:', error);
      this._triggerCallback('onError', {
        code: 'UPDATE_CONFIG_FAILED',
        message: '更新配置失败',
        error
      });
      return false;
    }
  }

  /**
   * 读取设备配置
   * @returns {Promise<boolean>} 是否成功发送读取配置命令
   */
  async readDeviceConfig() {
    if (!this._verifyOperationConditions(this.characteristicIds.config)) {
      return false;
    }

    try {
      // 更新最后活动时间
      this._updateLastActivityTime();

      // 发送读取命令
      await wx.readBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.characteristicIds.config
      });

      console.log('[BLE] 读取设备配置命令发送成功');
      return true;
    } catch (error) {
      console.error('[BLE] 读取设备配置命令发送失败:', error);
      this._triggerCallback('onError', {
        code: 'READ_CONFIG_FAILED',
        message: '读取设备配置失败',
        error
      });
      return false;
    }
  }

  /**
   * 获取校准数据，发送采样一次命令
   */
  async getCalibrationInfo() {
     // 验证操作条件
    if (!this._verifyOperationConditions()) {
      return false;
    }

    try {
      // 构建采样一次命令
      const buffer = new ArrayBuffer(1); // 命令(1字节) 
      const dataView = new DataView(buffer);

      // 设置命令 - GET_ONE_SAMPLING
      dataView.setUint8(0, this.Commands.GET_ONE_SAMPLING);

      // 发送命令
      return await this._sendBLECommand(buffer);
    } catch (error) {
      console.error('[BLE] 获取校准数据:', error);
      this._triggerCallback('onError', {
        code: 'get_Calibration_Info_FAILED',
        message: '获取校准数据',
        error
      });
      return false;
    }

  }
  /**
   * 启用数据通知
   * @returns {Promise<boolean>} 是否成功启用通知
   */
  async enableNotifications() {
    if (!this.isConnected) {
      this._triggerCallback('onError', {
        code: 'NOT_CONNECTED',
        message: '设备未连接'
      });
      return false;
    }

    // 检查是否有数据特征值
    if (!this.characteristicIds.data) {
      this._triggerCallback('onError', {
        code: 'NO_DATA_CHAR',
        message: '未找到数据特征值'
      });
      return false;
    }

    try {
      // 启用通知
      await wx.notifyBLECharacteristicValueChange({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.characteristicIds.data,
        state: true
      });

      console.log('[BLE] 启用数据通知成功');
      return true;
    } catch (error) {
      console.error('[BLE] 启用数据通知失败:', error);
      this._triggerCallback('onError', {
        code: 'ENABLE_NOTIFY_FAILED',
        message: '启用数据通知失败',
        error
      });
      return false;
    }
  }

  /**
   * 注册回调函数
   * @param {string} event 事件名称
   * @param {Function} callback 回调函数
   */
  registerCallback(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event] = callback;
    } else {
      console.warn(`[BLE] 未知的事件类型: ${event}`);
    }
  }

  unregisterCallback(event, callback) {
    if (this.callbacks.hasOwnProperty(event) && Array.isArray(this.callbacks[event])) {
      const index = this.callbacks[event].indexOf(callback);
      if (index !== -1) {
        this.callbacks[event].splice(index, 1);
        console.log(`[BLE] 已取消注册回调: ${event}`);
      }
    }
  }
  /**
   * 获取当前传输状态
   * @returns {Object} 传输状态对象
   */
  getTransferStatus() {
    return {
      ...this.transferStatus
    };
  }

  /**
   * 获取安全验证状态
   * @returns {Object} 安全状态对象
   */
  getSecurityStatus() {
    return {
      isPaired: this.isPaired,
      isVerified: this.isVerified
    };
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 清除所有计时器
    this._clearAllTimers();

    // 停止扫描
    if (this.isScanning) {
      this.stopScan();
    }

    // 断开连接
    if (this.isConnected) {
      this.disconnectDevice();
    }

    // 关闭蓝牙适配器
    if (this.isInitialized) {
      wx.closeBluetoothAdapter();
      this.isInitialized = false;
    }

    // 取消监听
    wx.offBluetoothAdapterStateChange();
    wx.offBLEConnectionStateChange();
    wx.offBLECharacteristicValueChange();
    wx.offBluetoothDeviceFound();
  }

  // ==================== 私有方法 ====================


  /**
   * 验证基本操作条件
   * @param {boolean} characteristicIds 要验证的特征值
   * @returns {boolean} 是否满足条件
   */
  _verifyOperationConditions(characteristicIds = this.characteristicIds.control) {
    // 检查连接状态
    if (!this.isConnected) {
      this._triggerCallback('onError', {
        code: 'NOT_CONNECTED',
        message: '设备未连接'
      });
      return false;
    }

    // 检查是否已验证
    if (!this.isVerified) {
      this._triggerCallback('onError', {
        code: 'NOT_VERIFIED',
        message: '设备未完成安全验证'
      });
      return false;
    }

    // 检查是否有控制特征值
    if (!characteristicIds) {
      this._triggerCallback('onError', {
        code: 'NO_CONTROL_CHAR',
        message: '未找到控制特征值'
      });
      return false;
    }

    return true;
  }

  /**
   * 发送BLE命令
   * @param {ArrayBuffer} buffer 完整的命令数据缓冲区
   * @returns {Promise<boolean>} 是否成功发送命令
   */
  async _sendBLECommand(buffer) {
    // 验证操作条件
    if (!this._verifyOperationConditions()) {
      return false;
    }

    try {
      // 更新最后活动时间
      this._updateLastActivityTime();

      // 发送命令
      await wx.writeBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.characteristicIds.control,
        value: buffer
      });

      // 获取命令ID用于日志
      const commandId = new DataView(buffer).getUint8(0);
      console.log(`[BLE] 命令 0x${commandId.toString(16)} 发送成功`);

      return true;
    } catch (error) {
      console.error(`[BLE] 命令发送失败:`, error);
      this._triggerCallback('onError', {
        code: 'COMMAND_SEND_FAILED',
        message: `命令发送失败`,
        error
      });
      return false;
    }
  }
  /**
   * 蓝牙适配器状态变化回调
   * @private
   */
  _onBluetoothAdapterStateChange(res) {
    console.log('[BLE] 蓝牙适配器状态变化:', res);

    // 如果蓝牙不可用，更新状态
    if (!res.available) {
      this.isInitialized = false;
      this.isScanning = false;

      if (this.isConnected) {
        this.isConnected = false;
        this.isVerified = false;
        this._triggerCallback('onDisconnected', {
          deviceId: this.deviceId,
          reason: 'ADAPTER_OFF'
        });
      }
    }
  }

  /**
   * 设备连接状态变化回调
   * @private
   */
  _onBLEConnectionStateChange(res) {
    console.log('[BLE] 设备连接状态变化:', res);
    console.log('[BLE] 当前连接状态:', {
      'res.connected': res.connected,
      'this.isConnected': this.isConnected,
      'res.deviceId': res.deviceId,
      'this.deviceId': this.deviceId,
      '设备ID是否匹配': res.deviceId === this.deviceId,
      '条件检查结果': !res.connected && this.isConnected && res.deviceId === this.deviceId
    });
    // 更新连接状态
    if (!res.connected && this.isConnected && res.deviceId === this.deviceId) {
      this.isConnected = false;
      this.isVerified = false;
      console.log('[BLE] 条件满足，处理断开连接...');

      // 清除所有计时器
      this._clearAllTimers();
      console.log('[BLE] 触发回调...');

      this._triggerCallback('onDisconnected', {
        deviceId: res.deviceId,
        reason: 'DEVICE_DISCONNECTED'
      });
    }
  }

  /**
   * 特征值变化回调
   * @private
   */
  _onBLECharacteristicValueChange(res) {
    // 只处理已连接设备的特征值变化
    if (res.deviceId !== this.deviceId || !this.isConnected) {
      return;
    }
    // 更新最后活动时间
    this._updateLastActivityTime();

    const characteristicId = res.characteristicId.toUpperCase();
    const value = new Uint8Array(res.value);

    console.log('[BLE] 特征值变化:', characteristicId,
      '长度:', value.length,
      '前几个字节:', Array.from(value.slice(0, Math.min(10, value.length))));

    // 处理数据特征值
    if (characteristicId === this.characteristicIds.data) {
      this._processDataCharacteristic(value);
    }

    // 处理信息特征值 
    if (characteristicId === this.characteristicIds.info) {
      this._processInfoCharacteristic(value);
    }

    // 处理配置特征值
    if (characteristicId === this.characteristicIds.config) {
      this._processConfigCharacteristic(value);
    }

    // 触发回调
    this._triggerCallback('onCharacteristicChanged', {
      characteristicId,
      value
    });
  }

  /**
   * 处理信息特征值数据
   * @param {Uint8Array} value 特征值数据
   * @private
   */
  _processInfoCharacteristic(value) {
    if (value.length < 37) { // ESP32现在发送37字节
      console.warn('[BLE] 设备信息数据长度不足:', value.length, '应为37字节');
      return;
    }

    // 解析设备信息结构体
    const dataView = new DataView(value.buffer);

    // 根据ESP32优化后的数据格式进行解析
    // 字节序问题：ESP32发送的deviceId是以小端序排列的，但JavaScript中需要转换
    const deviceIdRaw = dataView.getUint32(0, true);
    // 将实际发送的deviceId (0x03040506) 转换为期望的格式
    const deviceId = this._reverseByteOrder(deviceIdRaw);

    const firmwareVersion = dataView.getUint8(4);
    const hardwareVersion = dataView.getUint8(5);
    const bootCount = dataView.getUint32(6, true);

    // 时间戳在10-17字节位置
    const timeLow = dataView.getUint32(10, true);
    const timeHigh = dataView.getUint32(14, true);
    const savedTime = timeLow + timeHigh * 4294967296; // 2^32

    // 配对状态在18字节位置
    const isPaired = dataView.getUint8(18) === 1;

    // MAC地址在19-24字节位置
    const macAddress = [];
    for (let i = 0; i < 6; i++) {
      macAddress.push(dataView.getUint8(19 + i).toString(16).padStart(2, '0'));
    }
    const macAddressStr = macAddress.join(':');

    // 文件系统总大小在25-28字节位置
    const totalBytes = dataView.getUint32(25, true);

    // 文件系统可用空间在29-32字节位置
    const freeBytes = dataView.getUint32(29, true);

    const oldPaired = this.isPaired;
    this.isPaired = isPaired;

    // 更新验证状态，标记为已验证
    this.isVerified = true;

    // 清除安全验证计时器
    if (this._securityTimer) {
      clearTimeout(this._securityTimer);
      this._securityTimer = null;
    }

    // 设备信息
    const deviceInfo = {
      deviceId,
      firmwareVersion: `${firmwareVersion}`,
      hardwareVersion: `${hardwareVersion}`,
      bootCount,
      savedTime,
      isPaired,
      macAddress: macAddressStr,
      storageTotal: totalBytes,
      storageFree: freeBytes
    };

    // 如果配对状态发生变化，触发配对成功回调
    if (!oldPaired && isPaired) {
      this._triggerCallback('onPaired', {
        deviceId: this.deviceId,
        deviceInfo
      });
    }
    this._triggerCallback('onCommandResponse', {
      type: 'INFO_READ',
      deviceInfo,
      success: true
    });
    console.log(`[BLE] 设备信息: ID=0x${deviceId.toString(16).padStart(8, '0')} (${deviceId}), 固件=${firmwareVersion}, 硬件=${hardwareVersion}, 配对=${isPaired ? '是' : '否'}, MAC=${macAddressStr}, 总空间=${totalBytes}字节, 可用空间=${freeBytes}字节, 时间戳=${savedTime}`);

    return deviceInfo;
  }

  /**
   * 反转32位整数的字节顺序
   * @param {number} value 需要反转字节顺序的值
   * @return {number} 反转后的值
   */
  _reverseByteOrder(value) {
    return (
      ((value & 0x000000FF) << 24) |
      ((value & 0x0000FF00) << 8) |
      ((value & 0x00FF0000) >> 8) |
      ((value & 0xFF000000) >> 24)
    );
  }
  /**
   * 处理配置特征值数据
   * @param {Uint8Array} value 特征值数据
   * @private
   */
  _processConfigCharacteristic(value) {
    if (value.length < 8) {
      console.warn('[BLE] 设备配置数据长度不足:', value.length);
      return;
    }

    // 解析DeviceConfig结构体
    const dataView = new DataView(value.buffer);

    // 提取各字段
    const samplingInterval = dataView.getUint8(0); // 采样间隔(分钟)
    const pressureMax = dataView.getUint16(1, true); // 压力上限
    const pressureMin = dataView.getUint16(3, true); // 压力下限
    // 设备配置
    const config = {
      samplingInterval,
      pressureMax,
      pressureMin
    };
    console.log("config" + config)

    // 触发配置读取回调
    this._triggerCallback('onCommandResponse', {
      type: 'CONFIG_READ',
      config,
      success: true
    });

    console.log('[BLE] 设备配置:', config);
  }

  /**
   * 处理数据特征值
   * @param {Uint8Array} value 特征值数据
   * @private
   */
  _processDataCharacteristic(value) {
    if (value.length < 1) return;

    const responseType = value[0]; // 第一个字节是响应类型

    console.log(`[BLE] 接收到响应类型: 0x${responseType.toString(16)}`);

    // 处理不同类型的响应
    switch (responseType) {
      // 验证成功响应
      case this.ResponseTypes.AUTH_SUCCESS:
        this._processAuthSuccess(value);
        break;

        // 同步完成响应
      case this.ResponseTypes.SYNC_COMPLETE:
        this._processSimpleResponse(value, 'SYNC_TIME');
        break;

        // 数据包头响应
      case this.ResponseTypes.PACKET_HEADER:
        this._processPacketHeader(value);
        break;

        // 数据包响应
      case this.ResponseTypes.PACKET_DATA:
        this._processPacketData(value);
        break;

        // 传输完成响应
      case this.ResponseTypes.COMPLETELY_DATA:
        this._processCompletelyData(value);
        break;

        // 删除完成响应
      case this.ResponseTypes.DELETE_COMPLETE:
        this._processSimpleResponse(value, 'DELETE_RANGE');
        break;

        // 清除完成响应
      case this.ResponseTypes.CLEAR_COMPLETE:
        this._processSimpleResponse(value, 'CLEAR_ALL');
        break;

        // 采样一次完成响应
        case this.ResponseTypes.RES_ONE_SAMPLING:
          this._processCalibrationResponse(value, 'RES_ONE_SAMPLING');
          break;
        // 工厂重置完成响应
      case this.ResponseTypes.FACTORY_COMPLETE:
        this._processSimpleResponse(value, 'FACTORY_RESET', () => {
          // 重置设备信息
          this.isPaired = false;
          this.isVerified = false;
          wx.removeStorageSync('ble_saved_device');

          // 断开连接
          setTimeout(() => {
            this.disconnectDevice();
          }, 500);
        });
        break;

        // 取消配对完成响应
      case this.ResponseTypes.UNPAIR_COMPLETE:
        this._processSimpleResponse(value, 'UNPAIR_DEVICE', () => {
          // 更新配对状态
          this.isPaired = false;

          // 更新保存的设备信息
          this._saveDeviceInfo();

          // 断开连接
          setTimeout(() => {
            this.disconnectDevice();
          }, 500);
        });
        break;

      default:
        console.warn(`[BLE] 未知的响应类型: 0x${responseType.toString(16)}`);
    }
  }

  /**
   * 处理验证成功响应
   * @param {Uint8Array} value 响应数据
   * @private
   */
  _processAuthSuccess(value) {
    if (value.length < 2) {
      console.warn('[BLE] 验证响应数据长度不足:', value.length);
      return;
    }

    const isSuccess = value[1] === 0x01;

    console.log(`[BLE] 设备验证${isSuccess ? '成功' : '失败'}`);

    // 更新验证状态
    this.isVerified = isSuccess;

    // 清除安全验证计时器
    if (this._securityTimer) {
      clearTimeout(this._securityTimer);
      this._securityTimer = null;
    }

    // 如果验证成功，触发验证成功回调
    if (isSuccess) {
      console.log("onVerify ");
      this._triggerCallback('onVerified', {
        deviceId: this.deviceId
      });
    } else {
      this._triggerCallback('onError', {
        code: 'AUTH_FAILED',
        message: '设备验证失败'
      });
    }
  }


  /**
   * 处理包头响应
   * @param {Uint8Array} value 响应数据
   * @private
   */
  _processPacketHeader(value) {
    if (value.length < 10) { // 现在至少需要10字节: 2字节包头 + 4字节总记录数 + 4字节总包数
      console.warn('[BLE] 包头响应数据长度不足:', value.length);
      return;
    }

    const dataView = new DataView(value.buffer);
    const isSuccess = value[1] === this.StatusFlag.SUCCESS;

    if (!isSuccess) {
      console.error('[BLE] 获取包头失败');
      return;
    }

    // 解析记录总数和总包数
    const totalRecords = dataView.getUint32(2, true);
    const totalPackets = dataView.getUint32(6, true);

    console.log(`[BLE] 数据传输开始, 总记录数: ${totalRecords}, 总包数: ${totalPackets}`);

    // 更新传输状态
    this.transferStatus = {
      inProgress: true,
      startTime: Date.now(),
      totalRecords,
      totalPackets,
      currentPacket: 0,
      records: []
    };

    // 触发命令响应回调
    this._triggerCallback('onCommandResponse', {
      type: 'START_TRANS',
      success: true,
      totalRecords,
      totalPackets
    });

    // 启动传输超时计时器
    this._startTransferTimer();

    // 自动请求第一个数据包
    setTimeout(() => {
      this.requestDataPacket(0);
    }, 100);
  }

  /**
   * 处理数据包响应
   * @param {Uint8Array} value 响应数据
   * @private
   */
  _processPacketData(value) {
    if (value.length < 5) {
      console.warn('[BLE] 数据包响应数据长度不足:', value.length);
      return;
    }

    const dataView = new DataView(value.buffer);
    const isSuccess = value[1] === this.StatusFlag.SUCCESS;

    if (!isSuccess) {
      console.error('[BLE] 获取数据包失败');
      return;
    }

    // 解析包号和记录数
    const packetNum = dataView.getUint16(2, true);
    const recordCount = value[4];

    console.log(`[BLE] 收到数据包 ${packetNum}, 包含 ${recordCount} 条记录`);

    if (!this.transferStatus.inProgress) {
      console.warn('[BLE] 收到数据包但没有正在进行的传输');
      return;
    }

    // 重置传输超时计时器
    this._startTransferTimer();

    // 检查校验和（最后一个字节）
    const checksum = value[value.length - 1];
    const calculatedChecksum = this._calculateChecksum(value.slice(0, value.length - 1));

    if (checksum !== calculatedChecksum) {
      console.warn('[BLE] 校验和不匹配:', checksum, calculatedChecksum);
      // 可以考虑在这里请求重传
      return;
    }

    // 解析记录
    const records = [];
    for (let i = 0; i < recordCount; i++) {
      // 偏移量，跳过包头5字节
      const offset = 5 + i * 20; // 每条记录20字节

      if (offset + 20 > value.length - 1) break; // 减1是为了不包括校验和

      // 解析记录
      try {
        // 读取时间戳(8字节)
        const timeLow = dataView.getUint32(offset, true);
        const timeHigh = dataView.getUint32(offset + 4, true);
        const timestamp = (timeLow + timeHigh * 4294967296) * 1000;

        // 读取3个浮点数值（压力值）
        const pressure1 = dataView.getFloat32(offset + 8, true);
        const pressure2 = dataView.getFloat32(offset + 12, true);
        const pressure3 = dataView.getFloat32(offset + 16, true);
        const recordTime = new Date(timestamp).toLocaleString();
        console.log(`[BLE] 记录 ${i+1}/${recordCount} 解析结果:
                  时间戳: ${timestamp} (${recordTime})
                  压力1: ${pressure1.toFixed(2)}
                  压力2: ${pressure2.toFixed(2)}
                  压力3: ${pressure3.toFixed(2)}
                  原始字节: 低32位=${timeLow}, 高32位=${timeHigh}
                `);
        
        const formatpressure1 = this._formatPressure(pressure1);
        const formatpressure2 = this._formatPressure(pressure2);
        const formatpressure3 = this._formatPressure(pressure3);

        console.log(`[BLE] 记录 ${i+1}/${recordCount} 解析结果:
                  时间戳: ${timestamp} (${recordTime})
                  压力1: ${formatpressure1.toFixed(2)}
                  压力2: ${formatpressure2.toFixed(2)}
                  压力3: ${formatpressure3.toFixed(2)}
                  原始字节: 低32位=${timeLow}, 高32位=${timeHigh}
                `);
        // 存入记录数组，不再生成完整时间字符串，改由UI层处理
        records.push({
          timestamp,
          formatpressure1,
          formatpressure2,
          formatpressure3
        });
        // const recordTime = new Date(timestamp).toLocaleString();
        // 打印每条记录的详细信息  
        //         console.log(`[BLE] 记录 ${i+1}/${recordCount} 解析结果:
        //   时间戳: ${timestamp} (${recordTime})
        //   压力1: ${pressure1.toFixed(2)}
        //   压力2: ${pressure2.toFixed(2)}
        //   压力3: ${pressure3.toFixed(2)}
        //   原始字节: 低32位=${timeLow}, 高32位=${timeHigh}
        // `);
      } catch (error) {
        console.error('[BLE] 解析记录失败:', error);
      }
    }

    // 添加记录到传输状态
    this.transferStatus.records = [...this.transferStatus.records, ...records];
    this.transferStatus.currentPacket = packetNum + 1;


    // 触发回调
    this._triggerCallback('onCommandResponse', {
      type: 'DATA_PACK',
      success: true,
      records: this.transferStatus.records,
      currentPacket: this.transferStatus.currentPacket
    });

    // 请求下一个数据包
    setTimeout(() => {
      this.requestDataPacket(this.transferStatus.currentPacket);
    }, 100);
  }

  _formatPressure(pressure){
    formatValue=(((3.3-pressure)/10*pressure)-0.3749)/0.0004
    return formatValue
  }

  _bufferToHexString(buffer) {
    // 确保buffer是Uint8Array或类似的数组类型
    const data = new Uint8Array(buffer.buffer || buffer);

    // 单行打印完整的十六进制字符串，避免分行导致不完整
    let hexOutput = 'Hex: ';
    for (let i = 0; i < data.length; i++) {
      hexOutput += data[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
    }

    // 直接返回完整的十六进制输出
    return hexOutput;
  }
  /**
   * 处理传输完成响应 - 注意此处不检验校验和
   * @param {Uint8Array} value 响应数据
   * @private
   */
  _processCompletelyData(value) {
    if (value.length < 8) {
      console.warn('[BLE] 传输完成响应数据长度不足:', value.length);
      return;
    }

    const dataView = new DataView(value.buffer);
    const isSuccess = value[1] === this.StatusFlag.SUCCESS;

    if (!isSuccess) {
      console.error('[BLE] 数据传输失败');
      return;
    }

    // 解析传输信息
    const totalPackets = dataView.getUint16(2, true);
    const totalRecords = dataView.getUint32(4, true);

    console.log(`[BLE] 数据传输完成, 共 ${totalPackets} 个包, ${totalRecords} 条记录`);

    // 清除传输超时计时器
    if (this._transferTimer) {
      clearTimeout(this._transferTimer);
      this._transferTimer = null;
    }

    // 标记传输完成
    this.transferStatus.inProgress = false;

    // 注意：不再检查校验和

    // 触发传输完成回调
    this._triggerCallback('onTransferCompleted', {
      records: [...this.transferStatus.records],
      totalPackets,
      totalRecords
    });
  }

  
  /**
   * 处理校准数据回调
   * @param {string} type      
   * @param {Function} successCallback 成功时的回调函数(可选)
   * @returns {boolean} 响应是否成功处理
   * @private
   */
  _processCalibrationResponse(value) {
    if (value.length < 20) {
      console.warn(`[BLE] Calibration 响应数据长度不足:`, value.length);
      return false;
    }

    const isSuccess = value[1] === this.StatusFlag.SUCCESS;
    console.log(`[BLE] Calibration ${isSuccess ? '成功' : '失败'}`);
    const offset = 2;
    //解析数据
    const dataView = new DataView(value.buffer);
    const timeLow = dataView.getUint32(offset, true);
    const timeHigh = dataView.getUint32(offset + 4, true);
    const timestamp = (timeLow + timeHigh * 4294967296) * 1000;

    // 读取3个浮点数值（压力值）
    const pressure1 = dataView.getFloat32(offset + 8, true);
    const pressure2 = dataView.getFloat32(offset + 12, true);
    const pressure3 = dataView.getFloat32(offset + 16, true);
    
    const calibrationInfo = {
      timestamp,
      pressure1,
      pressure2,
      pressure3,
    }
    // 触发命令响应回调
    this._triggerCallback('onCommandResponse', {
      type: 'CALIB_RES', //校准响应
      success: isSuccess,
      calibrationInfo
    });

    return isSuccess;
  }

  /**
   * 处理简单的成功/失败响应
   * @param {string} type      
   * @param {Function} successCallback 成功时的回调函数(可选)
   * @returns {boolean} 响应是否成功处理
   * @private
   */
  _processSimpleResponse(value, type, successCallback = null) {
    if (value.length < 2) {
      console.warn(`[BLE] ${type}响应数据长度不足:`, value.length);
      return false;
    }

    const isSuccess = value[1] === this.StatusFlag.SUCCESS;
    console.log(`[BLE] ${type}${isSuccess ? '成功' : '失败'}`);

    // 触发命令响应回调
    this._triggerCallback('onCommandResponse', {
      type: type,
      success: isSuccess,
    });

    // 如果有成功回调且操作成功，则执行成功回调
    if (isSuccess && successCallback) {
      successCallback();
    }

    return isSuccess;
  }

  /**
   * 获取设备的服务和特征值
   * @private
   */
  async _getDeviceServices() {
    try {
      console.log('[BLE] 开始获取设备服务');

      // 获取所有服务
      const servicesRes = await wx.getBLEDeviceServices({
        deviceId: this.deviceId
      });

      console.log('[BLE] 获取到服务列表:', servicesRes.services.map(s => s.uuid));

      // 查找我们的目标服务
      const targetService = servicesRes.services.find(service =>
        service.uuid.toUpperCase().includes('ABC0')
      );

      if (!targetService) {
        console.error('[BLE] 未找到目标服务 ABC0');
        throw new Error('未找到目标服务');
      }

      this.serviceId = targetService.uuid;
      console.log(`[BLE] 找到目标服务: ${this.serviceId}`);

      // 获取服务的特征值
      const characteristicsRes = await wx.getBLEDeviceCharacteristics({
        deviceId: this.deviceId,
        serviceId: this.serviceId
      });

      console.log('[BLE] 获取到特征值列表:',
        characteristicsRes.characteristics.map(c => c.uuid));

      // 重置特征值ID
      this.characteristicIds = {
        info: '',
        config: '',
        data: '',
        control: ''
      };

      // 匹配特征值
      characteristicsRes.characteristics.forEach(characteristic => {
        const uuid = characteristic.uuid.toUpperCase();

        if (uuid.includes('ABC1')) {
          this.characteristicIds.info = uuid;
          console.log('[BLE] 找到信息特征值:', uuid);
        } else if (uuid.includes('ABC2')) {
          this.characteristicIds.config = uuid;
          console.log('[BLE] 找到配置特征值:', uuid);
        } else if (uuid.includes('ABC3')) {
          this.characteristicIds.data = uuid;
          console.log('[BLE] 找到数据特征值:', uuid);

          // 如果支持notify，启用通知
          if (characteristic.properties.notify) {
            this.enableNotifications().catch(err => {
              console.warn('[BLE] 启用通知失败:', err);
            });
          }
        } else if (uuid.includes('ABC4')) {
          this.characteristicIds.control = uuid;
          console.log('[BLE] 找到控制特征值:', uuid);
        }
      });

      // 验证是否找到了所有需要的特征值
      if (!this.characteristicIds.info || !this.characteristicIds.config ||
        !this.characteristicIds.data || !this.characteristicIds.control) {
        console.warn('[BLE] 未找到所有需要的特征值:', this.characteristicIds);
      }

      return true;
    } catch (error) {
      console.error('[BLE] 获取服务和特征值失败:', error);
      this._triggerCallback('onError', {
        code: 'GET_SERVICES_FAILED',
        message: '获取服务和特征值失败: ' + error.message,
        error
      });
      return false;
    }
  }

  /**
   * 判断设备是否是ESP32C6设备
   * @param {Object} device 设备对象
   * @returns {boolean} 是否是ESP32C6设备
   * @private
   */
  _isESP32Device(device) {
    const name = device.name || device.localName || '';
    return name.includes('ESP32C6');
  }

  /**
   * 触发回调函数
   * @param {string} event 事件名称
   * @param {*} data 回调数据
   * @private
   */
  _triggerCallback(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event](data);
    }
  }

  /**
   * 保存设备信息到本地存储
   * @private
   */
  _saveDeviceInfo() {
    try {
      wx.setStorageSync('ble_saved_device', {
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        isPaired: this.isPaired,
        time: Date.now()
      });
      console.log('[BLE] 设备信息已保存');
    } catch (error) {
      console.error('[BLE] 保存设备信息失败:', error);
    }
  }

  /**
   * 从本地存储加载设备信息
   * @private
   */
  _loadSavedDeviceInfo() {
    try {
      const savedDevice = wx.getStorageSync('ble_saved_device');
      if (savedDevice && savedDevice.deviceId) {
        this.deviceId = savedDevice.deviceId;
        this.deviceName = savedDevice.deviceName || 'Unknown Device';
        this.isPaired = savedDevice.isPaired || false;
        console.log('[BLE] 已加载保存的设备信息:', this.deviceName);
      }
    } catch (error) {
      console.error('[BLE] 加载设备信息失败:', error);
    }
  }

  /**
   * 启动安全验证超时计时器
   * @private
   */
  _startSecurityTimer() {
    // 清除旧的计时器
    if (this._securityTimer) {
      clearTimeout(this._securityTimer);
    }

    // 设置新的计时器
    this._securityTimer = setTimeout(() => {
      if (this.isConnected && !this.isVerified) {
        console.log('[BLE] 安全验证超时，断开连接');

        // 先触发错误回调，再断开连接
        this._triggerCallback('onError', {
          code: 'SECURITY_TIMEOUT',
          message: '安全验证超时，连接已断开'
        });

        // 保存当前设备ID，因为断开连接后可能会被清空
        const deviceId = this.deviceId;

        // 断开连接
        this.disconnectDevice().finally(() => {
          // 确保状态更新和回调触发
          if (this.isConnected) {
            this.isConnected = false;
            this.isVerified = false;

            // 再次触发断开回调，确保UI更新
            this._triggerCallback('onDisconnected', {
              deviceId: deviceId,
              reason: 'SECURITY_TIMEOUT'
            });
          }
        });
      }
    }, this.SECURITY_TIMEOUT);
  }

  /**
   * 启动连接空闲超时计时器
   * @private
   */
  _startConnectionTimer() {
    // 清除旧的计时器
    if (this._connectionTimer) {
      clearTimeout(this._connectionTimer);
    }

    // 设置新的计时器
    this._connectionTimer = setTimeout(() => {
      if (this.isConnected) {
        console.log('[BLE] 连接空闲超时，断开连接');

        // 先触发错误回调，再断开连接
        this._triggerCallback('onError', {
          code: 'CONNECTION_TIMEOUT',
          message: '连接空闲超时，连接已断开'
        });

        // 保存当前设备ID，因为断开连接后可能会被清空
        const deviceId = this.deviceId;

        // 断开连接
        this.disconnectDevice().finally(() => {
          // 确保状态更新和回调触发
          if (this.isConnected) {
            this.isConnected = false;
            this.isVerified = false;
            getApp().globalData.connectedDevice = null;
            // 清除本地存储
            wx.removeStorageSync('connectedDevice');
            // 再次触发断开回调，确保UI更新
            this._triggerCallback('onDisconnected', {
              deviceId: deviceId,
              reason: 'CONNECTION_TIMEOUT'
            });
          }
        });
      }
    }, this.CONNECTION_TIMEOUT);
  }

  /**
   * 启动传输超时计时器
   * @private
   */
  _startTransferTimer() {
    // 清除旧的计时器
    if (this._transferTimer) {
      clearTimeout(this._transferTimer);
    }

    // 设置新的计时器
    this._transferTimer = setTimeout(() => {
      if (this.transferStatus.inProgress) {
        console.log('[BLE] 数据传输超时，中止传输');

        // 保存当前状态用于回调
        const oldStatus = {
          ...this.transferStatus
        };

        // 更新状态
        this.transferStatus.inProgress = false;

        // 触发错误回调，包含传输状态信息
        this._triggerCallback('onError', {
          code: 'TRANSFER_TIMEOUT',
          message: '数据传输超时，传输已中止',
          transferStatus: oldStatus
        });

        // 断开传输但保持连接的情况下，通知UI更新传输状态
        this._triggerCallback('onTransferCompleted', {
          records: [...this.transferStatus.records],
          totalPackets: oldStatus.totalPackets || 0,
          totalRecords: oldStatus.records.length,
          success: false,
          reason: 'TIMEOUT'
        });
      }
    }, this.TRANSFER_TIMEOUT);
  }

  /**
   * 清除所有计时器
   * @private
   */
  _clearAllTimers() {
    if (this._securityTimer) {
      clearTimeout(this._securityTimer);
      this._securityTimer = null;
    }

    if (this._connectionTimer) {
      clearTimeout(this._connectionTimer);
      this._connectionTimer = null;
    }

    if (this._transferTimer) {
      clearTimeout(this._transferTimer);
      this._transferTimer = null;
    }
  }

  /**
   * 更新最后活动时间
   * @private
   */
  _updateLastActivityTime() {
    this._lastActivityTime = Date.now();

    // 重置连接空闲计时器
    if (this.isConnected) {
      this._startConnectionTimer();
    }
  }

  /**
   * 计算校验和
   * @param {Uint8Array} data 数据
   * @returns {number} 校验和
   * @private
   */
  _calculateChecksum(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return sum & 0xFF; // 取低8位
  }
}

// 创建单例
const bleManager = new BLEManager();
export default bleManager;