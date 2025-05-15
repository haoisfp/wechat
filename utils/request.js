const BASE_URL = 'http://localhost:8000'  // 替换为你的实际后端地址

const request = (options) => {
  return new Promise((resolve, reject) => {
    console.log('发起请求:', {
      url: BASE_URL + options.url,
      method: options.method,
      data: options.data
    })

    wx.request({
      url: BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'content-type': 'application/json',
        ...options.header
      },
      success: (res) => {
        console.log('请求成功响应:', res)
        resolve(res)
      },
      fail: (err) => {
        console.error('请求失败:', err)
        reject(err)
      }
    })
  })
}

export default request