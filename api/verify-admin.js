// 验证管理员密码的API接口

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('方法不允许');
  }
  
  try {
    // 从请求体中获取密码
    const { password } = req.body;
    
    // 从环境变量中获取正确的密码
    const correctPassword = process.env.ADMIN_PASSWORD;
    
    // 如果环境变量中没有设置密码，则返回错误
    if (!correctPassword) {
      console.error('未设置管理员密码环境变量(ADMIN_PASSWORD)');
      return res.status(500).json({
        success: false,
        error: '服务器配置错误：未设置管理员密码'
      });
    }
    
    // 验证密码
    if (!password || password !== correctPassword) {
      return res.status(401).json({
        success: false,
        error: '密码错误'
      });
    }
    
    // 密码正确
    return res.status(200).json({
      success: true
    });
  } catch (error) {
    console.error('验证密码出错:', error);
    return res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
} 