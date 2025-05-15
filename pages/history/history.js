// pages/history/history.js
import { handleTabChange } from '../../utils/navigator';
const themeManager = require('../../utils/themeManager');
const app = getApp();
Page({
  data: {
    active: 'history',
    historyList: [
    ],
    isRefreshing: false,
    isDarkMode: getApp().globalData.isDarkMode,
    themeData: {
      backgroundColor: '#e6f3ff',
      textColor: '#333333',
      cardBackground: '#f8f8f8',
      borderColor: '#eeeeee',
      statusGreen: '#52c41a',     
      statusGreenBg: '#e6f7e6',    
      statusRed: '#ff4d4f', 
      statusRedBg: '#ffe4e4',
      headerBackground: '#f5f5f5',
      iconColor: '#666666'
    }
  },
  onLoad() {
    app.checkLoginStatus();
    this.loadWearRecords();
    themeManager.initTheme(this);
  },
  onShow() {
    app.checkLoginStatus();
    this.loadWearRecords();
  },
  async onRefresh() {
    this.setData({
      isRefreshing: true
    });
    
    try {
      await this.loadWearRecords();
    } finally {
      this.setData({
        isRefreshing: false
      });
    }
  },
  async loadWearRecords() {
    const wearData = app.globalData.wearRecord?.data || {};
  
  // 将对象转换为数组格式
  const historyList = Object.entries(wearData).map(([date, duration]) => {
    // 将日期字符串转换为Date对象
    const dateObj = new Date(date);
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekday = weekdays[dateObj.getDay()];
    
    // 将分钟转换为小时，保留一位小数
    const hours = (duration / 60).toFixed(1);
    
    return {
      weekday: weekday,
      date: date,
      duration: hours + 'h',
      // 根据佩戴时长判断状态（16小时 = 960分钟）
      status: duration >= 960 ? 'green' : 'red'
    };
  });

  // 按日期降序排序（最近的日期在前）
  historyList.sort((a, b) => new Date(b.date) - new Date(a.date));

  this.setData({
    historyList: historyList
  });
  },
  async toggleTheme() {
    themeManager.toggleTheme(this);
  },
  async  updateThemeColors(isDarkMode) {
      console.log("更新主题颜色，夜间模式:", isDarkMode);
      
    if (isDarkMode) {
      // 夜间模式颜色
      this.setData({
        themeData: {
          backgroundColor: '#1f2937',  
          textColor: '#e5e7eb',      
          cardBackground: '#374151',   
          borderColor: '#4b5563',   
          statusGreen: '#52c41a',      // 绿色文字
          statusGreenBg: '#263c1e',    // 深色绿色背景
          statusRed: '#ff4d4f',        // 红色文字
          statusRedBg: '#3b2426',      // 深色红色背景      
          headerBackground: '#111827', 
          iconColor: '#d1d5db'         
        }
      });
    } else {
      // 日间模式颜色
      this.setData({
        themeData: {
          backgroundColor: '#e6f3ff',
          textColor: '#333333',
          cardBackground: '#f8f8f8',
          borderColor: '#eeeeee',
          statusGreen: '#52c41a',     
          statusGreenBg: '#e6f7e6',    
          statusRed: '#ff4d4f', 
          statusRedBg: '#ffe4e4',
          headerBackground: '#f5f5f5',
          iconColor: '#666666'
        }
      });
    }
    console.log("主题颜色已更新:", this.data.themeData);
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
    onChange(event) {
      const name = event.detail;
      this.setData({ active: name });
      handleTabChange(name);
    },
})
