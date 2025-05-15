// pages/exercise/exercise.js
import { handleTabChange } from '../../utils/navigator';
const themeManager = require('../../utils/themeManager');
const app = getApp()
Page({
  data: {
    active: 'exercise',
    isDarkMode: getApp().globalData.isDarkMode,
  },
  onLoad: function() {
    app.checkLoginStatus();
    themeManager.initTheme(this);
  },

  onShow: function() {
  },
  checkLogin: async function() {
    const app = getApp();
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
    goToBreathingExercise() {
      wx.navigateTo({
        url: '/pages/breathing/breathing'
      });
    },
    onChange(event) {
      const name = event.detail;
      this.setData({ active: name });
      handleTabChange(name);
    }
})