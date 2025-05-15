// pages/breathing/breathing.js
import { handleTabChange } from '../../utils/navigator';
Component({

  /**
   * 组件的属性列表
   */
  properties: {

  },

  /**
   * 组件的初始数据
   */
  data: {
    active: 'breathing'
  },
  onLoad: function() {
    this.checkLogin();
  },

  onShow: function() {
    this.checkLogin();
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
  /**
   * 组件的方法列表
   */
  methods: {
    quitExercise() {
      wx.navigateTo({
        url: '/pages/exercise/exercise'
      });
    },
    onChange(event) {
      const name = event.detail;
      this.setData({ active: name });
      handleTabChange(name);
    }
  }
})