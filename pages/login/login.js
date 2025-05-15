// pages/login/login.js
import { encrypt } from '../../utils/crypto'
import request from '../../utils/request'
const app=getApp()
Page({
  data: {
    username: '',
    password: '',
    uuid: '',
    code:'',
    verifyCodeUrl:'',
    isWxLoginLoading: false // 微信授权登录状态
  },
  onLoad(){
    // 如果已经登录，直接跳转到首页
    if (app.globalData.isLogin) {
      wx.navigateTo({
        url: '/pages/index/index',
      });
      return;
    }
    this.getVerifyCode()
  },
  onInputUsername(e){
    this.setData({
      username: e.detail.value
    })
  },
  onInputPassword(e) {
    this.setData({
      password: e.detail.value
    })
  },

  onInputCode(e) {
    this.setData({
      code: e.detail.value
    })
  },

  getVerifyCode() {
    wx.request({
      url: `${app.globalData.baseUrl}/auth/code`,
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          this.setData({
            uuid: res.data.uuid,
            verifyCodeUrl: res.data.img
          })
        } else {
          this.showError('获取验证码失败')
        }
      },
      fail: (err) => {
        console.error('获取验证码失败:', err)
        this.showError('获取验证码失败')
      }
    })
  },
  // 新增：微信一键登录
  onGotUserInfo() {
    if (this.data.wxLoginLoading) return;
    
    this.setData({ wxLoginLoading: true });
    
    wx.showLoading({
      title: '正在登录...'
    });
    
    // 获取微信登录code
    wx.login({
      success: (res) => {
        if (res.code) {
          this.handleWxLogin(res.code);
        } else {
          wx.hideLoading();
          this.setData({ wxLoginLoading: false });
          this.showError('获取微信授权失败');
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ wxLoginLoading: false });
        console.error('微信登录失败:', err);
        this.showError('微信登录失败');
      }
    });
  },
  
  // 新增：处理微信登录
  handleWxLogin(code) {
    wx.request({
      url: `${app.globalData.baseUrl}/auth/wx/oauth`,
      method: 'POST',
      data: { code },
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        wx.hideLoading();
        this.setData({ wxLoginLoading: false });
        
        if (res.statusCode === 200 && res.data && res.data.token) {
          // 登录成功处理
          app.updateUserInfo(res.data.user)
          wx.setStorageSync('token', res.data.token)
          app.globalData.token = res.data.token
          app.globalData.isLogin = true
          
          app.globalData.userId = res.data.user.id
          wx.setStorageSync('userId', res.data.user.id)
          app.getPatientInfoFromServer()
          app.getWearRecordInfoFromServer()
          
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          });
          
          setTimeout(() => {
            wx.navigateTo({
              url: '/pages/index/index',
            });
          }, 1500);
        } else if (res.data && res.data.needBind) {
          // 需要绑定账号
          wx.showModal({
            title: '账号绑定',
            content: '您尚未绑定账号，是否立即绑定?',
            success: (result) => {
              if (result.confirm) {
                wx.navigateTo({
                  url: `/pages/bind/bind?openId=${res.data.openId}`,
                });
              }
            }
          });
        } else {
          this.showError(res.data?.message || '微信登录失败');
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ wxLoginLoading: false });
        console.error('微信登录请求失败:', err);
        this.showError('网络错误，请稍后再试');
      }
    });
  },
  async handleLogin() {
    const { username, password, uuid, code } = this.data
    
    // 输入验证
    if (!username || !password || !code) {
      this.showError('请填写完整信息')
      return
    }

    wx.showLoading({
      title: '登录中...'
    })
    const encryptedPassword = encrypt(password);
      
      if (!encryptedPassword) {
        throw new Error("密码加密失败");
      }
    const loginData = {
      username,
      password: encryptedPassword,
      uuid,
      code
    }
    
    wx.request({
      url: `${app.globalData.baseUrl}/auth/wx/login`,
      method: 'POST',
      data: loginData,
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        wx.hideLoading()

        if (res.statusCode === 200 && res.data && res.data.token) {
          // 保存登录信息
          app.updateUserInfo(res.data.user.user)
          wx.setStorageSync('token', res.data.token)
          app.globalData.token=res.data.token
          app.globalData.isLogin=true
          // 保存患者信息
          app.globalData.userId=res.data.user.user.id
          wx.setStorageSync('userId', res.data.user.user.id)
          app.getPatientInfoFromServer()
          app.getWearRecordInfoFromServer()
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          })
          
          setTimeout(() => {
            wx.navigateTo({
              url: '/pages/index/index',
            })
          }, 1500)
        } else {
          this.showError(res.data?.message || '登录失败')
          this.getVerifyCode()
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('登录失败:', err)
        this.showError('网络错误')
        this.getVerifyCode()
      }
    })
  },
  showError(message) {
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2000
    })
  }
})