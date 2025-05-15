// pages/setting/setting.js
import { handleTabChange } from '../../utils/navigator';
const themeManager = require('../../utils/themeManager');
const app = getApp();
Page({
  data: {
    active: 'setting',
    avatarUrl: '/images/avatar.jpg',
    isLoading: false,
    isDarkMode:  wx.getStorageSync('isDarkMode'),
    themeData: {
      backgroundColor: '#f7f8fa',
      textColor: '#333333',
      cardBackground: '#ffffff',
      borderColor: '#f5f5f5',
      iconColor: '#666666',
      logoutColor: '#e74c3c',
      tabbarBg: '#ffffff',
      tabbarActive: '#4caf50',
      tabbarInactive: '#666666',
      shadowColor: 'rgba(0, 0, 0, 0.05)'
    }
  },

  onLoad: function() {
    app.checkLoginStatus();
    themeManager.initTheme(this);
  },

  onShow: function() {
  },
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
  onChange(event) {
    const name = event.detail;
    this.setData({ active: name });
    handleTabChange(name);
  },
  toggleTheme() {
    themeManager.toggleTheme(this);
    console.log("切换主题模式为:", this.data.isDarkMode ? "夜间" : "日间");
    wx.showToast({
      title: "已切换"+ (this.data.isDarkMode ? "夜间" : "日间") +"模式",
      icon: 'success',
      duration: 2000
    });
  },
  getAvatar(avatar){
    this.setData({
      avatarUrl: avatar.detail.avatarUrl
    })
  },
  handleDeviceConnect() {
    wx.navigateTo({
      url: '/pages/connect/connect',
    })
  },
  handleLanguage() {
    wx.showActionSheet({
      itemList: ['简体中文', 'English', '日本語'],
      success(res) {
      }
    });
  },
  // 数据同步
  handleDataSync(){
    this.setData({ isLoading: true });
    const app = getApp();
    try{
      app.getWearRecordInfoFromServer();
      console.log(app.globalData.wearRecord);
    }
    catch(error){
      console.log("同步佩戴记录失败！"+error)
    }
    try{
      app.getUserInfoFromServer();
      console.log(app.globalData.userInfo);
    }
    catch(error){
      console.log("同步用户信息失败！"+error)
    }
    try{
      app.getPatientInfoFromServer();
      console.log(app.globalData.patientInfo);
    }
    catch(error){
      console.log("同步患者信息失败！"+error)
    }
    setTimeout(() => {
      // 数据同步完成后
      this.setData({ isLoading: false });
      wx.showToast({
        title: '数据同步完成',
        icon: 'success',
        duration: 2000
      });
    }, 1500);
  },
  handleLogout(){
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const app = getApp()
          app.logout()
        }
      }
    })
  }
})