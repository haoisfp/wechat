export const handleTabChange = function(name) {
  const pages = {
    index: '/pages/index/index',
    pressure: '/pages/pressure/pressure',
    history: '/pages/history/history',
    exercise: '/pages/exercise/exercise',
    setting: '/pages/setting/setting'
  };

  if (pages[name]) {
    wx.redirectTo({
      url: pages[name]
    });
  }
};