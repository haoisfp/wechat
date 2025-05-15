// utils/themeManager.js
const app = getApp();
const data={
  setting_dark: {
    backgroundColor: '#1f2937',
    textColor: '#e5e7eb',
    cardBackground: '#374151',
    borderColor: '#4b5563',
    iconColor: '#d1d5db',
    logoutColor: '#f87171',
    tabbarBg: '#111827',
    tabbarActive: '#81c784',
    tabbarInactive: '#9ca3af',
    shadowColor: 'rgba(0, 0, 0, 0.3)'
  },
  setting_light: {
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
  },
  history_dark: {
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
  },
  history_white: {
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
}
/**
 * 获取当前主题模式
 * @returns {boolean} 是否为深色模式
 */
const getCurrentTheme = () => {
  return app.globalData.isDarkMode;
};

/**
 * 获取主题颜色配置
 * @param {boolean} isDarkMode - 是否为深色模式
 * @returns {Object} 主题颜色配置
 */
const getThemeData = (isDarkMode) => {
  if (isDarkMode) {
    return {
      backgroundColor: '#1f2937',
      textColor: '#e5e7eb',  
      cardBackground: '#374151',
      borderColor: '#4b5563',  
      primaryColor: '#4c8bf5',
      secondaryColor: '#7baaf7',
      inputBackground: '#333333',
      placeholderColor: '#888888',
      successColor: '#4caf50',
      warningColor: '#ff9800',
      errorColor: '#f44336'
    };
  } else {
    return {
      backgroundColor: '#f8f8f8',
      textColor: '#333333',
      cardBackground: '#ffffff',
      borderColor: '#eeeeee',
      primaryColor: '#1a73e8',
      secondaryColor: '#4285f4',
      inputBackground: '#ffffff',
      placeholderColor: '#bbbbbb',
      successColor: '#4caf50',
      warningColor: '#ff9800',
      errorColor: '#f44336'
    };
  }
};
/**
 * 初始化页面主题
 * @param {Object} pageContext - 页面或组件的上下文
 */
const initTheme = function(pageContext) {
  const isDarkMode = getCurrentTheme();
  app.globalData.isDarkMode = isDarkMode
  wx.setStorageSync('isDarkMode', isDarkMode)
  pageContext.setData({
    isDarkMode: isDarkMode
  });
};
/**
 * 切换主题模式
 * @param {Object} pageContext - 页面或组件的上下文
 */
const toggleTheme = function(pageContext) {
  const newMode = !app.globalData.isDarkMode;
  app.globalData.isDarkMode = newMode;
  wx.setStorageSync('isDarkMode', newMode)
  updateTheme(pageContext);
  return newMode;
};

/**
 * 更新主题（当全局主题变化时调用）
 * @param {Object} pageContext - 页面或组件的上下文
 */
const updateTheme = function(pageContext) {
  const darkMode = getCurrentTheme();
  if (pageContext.data.isDarkMode !== darkMode) {
    pageContext.setData({
      isDarkMode: darkMode
    });
  }
  // 设置导航栏颜色
  app.updateNavigationBarColor();
};

module.exports = {
  getCurrentTheme,
  getThemeData,
  initTheme,
  toggleTheme,
  updateTheme
};