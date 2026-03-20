const localtunnel = require('localtunnel');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log("🚇 Starting secure tunnel to Port 4000...");
  
  try {
    const tunnel = await localtunnel({ port: 4000 });
    const publicUrl = tunnel.url;
    
    console.log(`✅ Tunnel Active! Public URL: ${publicUrl}`);
    console.log(`🔗 Webhook URL for Meta: ${publicUrl}/api/webhook\n`);
    // 1. Inject into Frontend .env.local
    const frontendEnvPath = path.join(__dirname, 'frontend-dashboard', '.env.local');
    let frontendEnv = fs.existsSync(frontendEnvPath) ? fs.readFileSync(frontendEnvPath, 'utf8') : '';
    frontendEnv = frontendEnv.replace(/NEXT_PUBLIC_API_URL=.*/g, `NEXT_PUBLIC_API_URL=${publicUrl}/api`);
    if (!frontendEnv.includes('NEXT_PUBLIC_API_URL=')) frontendEnv += `\nNEXT_PUBLIC_API_URL=${publicUrl}/api`;
    fs.writeFileSync(frontendEnvPath, frontendEnv);

    // 2. Inject into Widget Config
    const widgetPath = path.join(__dirname, 'connectors', 'website', 'widget.js');
    if (fs.existsSync(widgetPath)) {
      let widgetCode = fs.readFileSync(widgetPath, 'utf8');
      widgetCode = widgetCode.replace(/const BACKEND_URL = ".*";/g, `const BACKEND_URL = "${publicUrl}";`);
      fs.writeFileSync(widgetPath, widgetCode);
    }

    // 3. Start all services using concurrently
    console.log("🚀 Booting Microservices...");
    const child = spawn('npm', ['run', 'dev:services'], { stdio: 'inherit', shell: true });

    tunnel.on('close', () => {
      console.log("Tunnel closed.");
      child.kill();
    });

    // Optional: You can actually trigger an API call here to auto-update Meta's webhook
    // if you have an endpoint for it!

  } catch (err) {
    console.error("Failed to start tunnel:", err);
  }
})();