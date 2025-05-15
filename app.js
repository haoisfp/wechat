// app.js
App({
  globalData: {
    connectedDevice: null,
    userInfo: null, //用户数据
    patientInfo: null, //患者数据
    userId: null, //从服务器获取数据
    token: null,
    isLogin: false,
    updateTimer: null,
    baseUrl: 'http://localhost:8000',
    bleMessages: [],  // 用于存储BLE消息
    wearRecord: [], //用于存储佩戴记录
    isDarkMode: false
  },

  onLaunch() {
    this.checkLoginStatus();
    this.startAutoUpdate();
    // 启动时检查当前时间并设置相应的模式
    this.updateDarkModeByTime();
    const isDarkMode = wx.getStorageSync('isDarkMode');
    if (isDarkMode !== '') {
      this.globalData.isDarkMode = isDarkMode;
    }
    // 立即设置导航栏颜色
    this.updateNavigationBarColor();
    const device = wx.getStorageSync('connectedDevice');
    if (device && device.deviceId) {
      this.globalData.connectedDevice = device;
    }
    
    // 设置定时器，每小时检查一次
    this.setDarkModeTimer();
    wx.event = {
      handlers: {},
      on(event, handler) {
        if (!this.handlers[event]) {
          this.handlers[event] = [];
        }
        this.handlers[event].push(handler);
      },
      off(event, handler) {
        if (this.handlers[event]) {
          const index = this.handlers[event].indexOf(handler);
          if (index !== -1) {
            this.handlers[event].splice(index, 1);
          }
        }
      },
      emit(event, data) {
        if (this.handlers[event]) {
          this.handlers[event].forEach(handler => handler(data));
        }
      }
    };
  },
  onHide: function() {
    // 应用进入后台时清除定时器
    if (this.darkModeTimer) {
      clearInterval(this.darkModeTimer);
    }
  },
  onShow: function() {
    // 每次应用进入前台时更新导航栏颜色
    this.updateNavigationBarColor();
    // 启动时检查当前时间并设置相应的模式
    this.updateDarkModeByTime();
    
    // 设置定时器，每小时检查一次
    this.setDarkModeTimer();
  },
  // 根据当前时间更新深色模式状态
  updateDarkModeByTime: function() {
    const now = new Date();
    const hour = now.getHours();
    
    // 晚上7点到早上6点之间为深色模式
    const shouldBeDarkMode = (hour >= 19 || hour < 6);
    
    // 更新全局状态
    this.globalData.isDarkMode = shouldBeDarkMode;
    
    console.log(`当前时间: ${hour}点，设置为${shouldBeDarkMode ? '深色' : '浅色'}模式`);
  },
  // 设置定时检查的定时器
  setDarkModeTimer: function() {
    // 每小时检查一次
    this.darkModeTimer = setInterval(() => {
      this.updateDarkModeByTime();
    }, 3600000); // 3600000毫秒 = 1小时
  },
  // 手动切换深色模式
  toggleDarkMode: function() {
    this.globalData.isDarkMode = !this.globalData.isDarkMode;
    return this.globalData.isDarkMode;
  },
  updateNavigationBarColor: function() {
    const isDarkMode = this.globalData.isDarkMode;
    wx.setNavigationBarColor({
      backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
      animation: {
        duration: 0, // 设置为0，禁用动画
        timingFunc: 'easeIn'
      }
    });
  },
  // 定时更新数据
  startAutoUpdate() {
    // 先立即更新一次
    this.getWearRecordInfoFromServer();
    this.getPatientInfoFromServer();
    // 定时器，每小时更新一次
    this.globalData.updateTimer = setInterval(() => {
      this.getWearRecordInfoFromServer();
      this.getPatientInfoFromServer();
    }, 3600000); // 3600000ms = 1小时
  },
  checkLoginStatus: function() {
    const token = wx.getStorageSync('token');
    if (token) {
      this.globalData.token = token;
      this.globalData.isLogin = true;
      this.getUserProfile();
      this.getPatientProfile();
      this.getRecordProfile();
    }else{
      wx.navigateTo({
        url: 'pages/login/login',
      })
    }
  },
  getRecordProfile(){
    const wearRecord = wx.getStorageSync('wearRecord');
    if (wearRecord) {
      this.globalData.wearRecord = wearRecord;
    } else {
      // 如果本地没有用户信息，从服务器获取
      this.getWearRecordInfoFromServer();
    }
  },
  getWearRecordInfoFromServer(){
    if (!this.globalData.token) {
      return;
    }
    const { startDate, endDate } = require('/utils/util').getLast7Days()
  
    wx.request({
      url: `${this.globalData.baseUrl}/api/weartime/${this.globalData.userId}/totaltime`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`
      },
      data: {
        startDate,
        endDate
      },
      success: (res) => {
        if (res.statusCode === 200) {
          // 保存到本地存储
          const wearingTimeData = {
            userId: this.globalData.userId,
            data: res.data,
            updateTime: new Date().getTime()
          }
          wx.setStorageSync('wearRecord', wearingTimeData)
          this.globalData.wearRecord=wearingTimeData
        } else {
          reject(new Error(res.data.message || '获取数据失败'))
        }
      },
      fail: () => {
        // 请求失败，可能是网络问题
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      }
    })
  
  },
  getUserProfile() {
    const userInfo = wx.getStorageSync('userInfo');

    if (userInfo) {
      this.globalData.userInfo = userInfo;
      this.globalData.userId = userInfo.id;
    } else {
      // 如果本地没有用户信息，从服务器获取
      this.getUserInfoFromServer();
    }
  },
  getPatientProfile() {
    const patientInfo = wx.getStorageSync('patientInfo');
    if (patientInfo) {
      this.globalData.patientInfo = patientInfo;
    } else {
      // 如果本地没有用户信息，从服务器获取
      this.getPatientInfoFromServer();
    }
  },
  // 从服务器获取患者信息
  getPatientInfoFromServer() {
    if (!this.globalData.token) {
      return;
    }
    wx.request({
      url: `${this.globalData.baseUrl}/api/patient/info/${this.globalData.userId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${this.globalData.token}`
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          this.globalData.patientInfo = res.data;
          wx.setStorageSync('patientInfo', res.data);
        } else {
          // 获取用户信息失败，可能是token过期
          this.logout();
        }
      },
      fail: () => {
        // 请求失败，可能是网络问题
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      }
    });
  },
  // 从服务器获取用户信息
  getUserInfoFromServer() {
    if (!this.globalData.token) {
      return;
    }
    wx.request({
      url: `${this.globalData.baseUrl}/auth/info`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${this.globalData.token}`
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          this.globalData.userInfo = res.data.user;
          this.globalData.userId = res.data.user.id;
          wx.setStorageSync('userInfo', res.data.user);
          wx.setStorageSync('userId', res.data.user.id);
        } else {
          // 获取用户信息失败，可能是token过期
          this.logout();
        }
      },
      fail: () => {
        // 请求失败，可能是网络问题
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      }
    });
  },
  logout() {
    // 清除本地存储
    // 重置全局数据
    this.globalData.token = null;
    this.globalData.userInfo = null;
    this.globalData.isLogin = false;
    this.globalData.patientInfo = null;
    this.globalData.userId = null;
    this.globalData.wearRecord = [];
    this.globalData.bleMessages = [];
    this.globalData.updateTimer = null;
    wx.clearStorageSync();
    // 跳转到登录页
    wx.navigateTo({
      url: '/pages/login/login',
    })
  },
  // 更新用户信息
  updateUserInfo(userInfo) {
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);
  },
  // 更新患者信息
  updatePatientInfo(patientInfo){
    this.globalData.patientInfo = patientInfo;
    wx.setStorageSync('patientInfo', patientInfo);
  },
  // 处理错误响应
  handleError(error) {
    console.error('App Error:', error);
    wx.showToast({
      title: error.message || '系统错误',
      icon: 'none'
    });
  }
})
