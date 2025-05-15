import WxmpRsa from 'wxmp-rsa'

// 密钥对生成 http://web.chacuo.net/netrsakeypair

const publicKey = 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANL378k3RiZHWx5AfJqdH9xRNBmD9wGD\n' +
  '2iRe41HdTNF8RUhNnHit5NpMNtGL0NPTSSpPjjI1kJfVorRvaQerUgkCAwEAAQ=='

// 加密
export function encrypt(txt) {
  try {
    const rsa = new WxmpRsa()
    rsa.setPublicKey(publicKey)
    return rsa.encrypt(txt)
  } catch (error) {
    console.error('RSA加密失败:', error)
    return ''
  }
}

