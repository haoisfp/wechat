// pages/index/index.js
import { handleTabChange } from '../../utils/navigator';
const app=getApp()
const themeManager = require('../../utils/themeManager');
const today = new Date()
const year = today.getFullYear()
const month = String(today.getMonth() + 1).padStart(2, '0')
const day = String(today.getDate()).padStart(2, '0')
const todayStr = `${year}-${month}-${day}`

Page({

  /**
   * 页面的初始数据
   */
  data: {
    active: 'index',
    todayWearTime:{
      hours: 0,
      minutes: 0
    },
    wearPercentage: 0,
    isDarkMode:app.globalData.isDarkMode
  },
  onLoad: function() {
    app.checkLoginStatus();
    this.updateWearTime();
    themeManager.initTheme(this);
  },
  onShow: function() {
    this.updateWearTime();
  },
  onChange(event) {
    const name = event.detail;
    this.setData({ active: name });
    handleTabChange(name);
  },
  // 下拉刷新
  onPullDownRefresh() {
    this.updateWearTime().then(() => {
      // 停止下拉刷新动画
      wx.stopPullDownRefresh()
      
      // 显示刷新成功提示
      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1000
      })
    }).catch(error => {
      wx.stopPullDownRefresh()
      wx.showToast({
        title: '刷新失败',
        icon: 'error',
        duration: 1000
      })
    })
  },
  updateWearTime() {
    return new Promise((resolve, reject) => {
      try {
        // 获取当天日期
        const today = new Date()
        const year = today.getFullYear()
        const month = String(today.getMonth() + 1).padStart(2, '0')
        const day = String(today.getDate()).padStart(2, '0')
        const todayStr = `${year}-${month}-${day}`

        // 从全局变量获取佩戴记录
        const wearRecord = app.globalData.wearRecord
        if (!wearRecord || !wearRecord.data) {
          throw new Error('无佩戴记录数据')
        }

        // 获取当天的佩戴时间(分钟)
        const todayMinutes = wearRecord.data[todayStr] || 0

        const percentage = (todayMinutes / 1440) * 100

        // 更新页面数据
        this.setData({
          todayWearTime: {
            hours: Math.floor(todayMinutes / 60),
            minutes: todayMinutes % 60
          },
          wearPercentage: percentage
        })
      } catch (error) {
        console.error('更新佩戴时间失败:', error)
      }
    })
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
  }
})