const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("🚇 Starting Cloudflare Tunnel to Port 4000...");

// Start cloudflared (using shell: true for Windows stability)
const cloudflared = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:4000'], { shell: true });

let tunnelUrl = '';
let servicesStarted = false;

// Cloudflare outputs its URL to stderr, not stdout
cloudflared.stderr.on('data', (data) => {
  const output = data.toString();
  
  // Regex to catch the trycloudflare.com URL
  const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  
  if (match && !tunnelUrl) {
    tunnelUrl = match[0];
    
    console.log(`\n✅ Tunnel Active! Public URL: ${tunnelUrl}`);
    console.log(`🔗 Webhook URL for Meta: ${tunnelUrl}/api/webhook\n`);

    // 1. Keep Frontend cleanly pointing to localhost to bypass CORS
    const frontendEnvPath = path.join(__dirname, 'frontend-dashboard', '.env.local');
    let frontendEnv = fs.existsSync(frontendEnvPath) ? fs.readFileSync(frontendEnvPath, 'utf8') : '';
    frontendEnv = frontendEnv.replace(/NEXT_PUBLIC_API_URL=.*/g, `NEXT_PUBLIC_API_URL=http://localhost:4000/api`);
    if (!frontendEnv.includes('NEXT_PUBLIC_API_URL=')) frontendEnv += `\nNEXT_PUBLIC_API_URL=http://localhost:4000/api`;
    fs.writeFileSync(frontendEnvPath, frontendEnv);

    // 2. Inject Cloudflare URL into Widget Config
    const widgetPath = path.join(__dirname, 'connectors', 'website', 'widget.js');
    if (fs.existsSync(widgetPath)) {
      let widgetCode = fs.readFileSync(widgetPath, 'utf8');
      widgetCode = widgetCode.replace(/const BACKEND_URL = ".*";/g, `const BACKEND_URL = "${tunnelUrl}";`);
      fs.writeFileSync(widgetPath, widgetCode);
    }

    // 3. Start the microservices ONLY ONCE (Added shell: true to fix EINVAL crash)
    if (!servicesStarted) {
      servicesStarted = true;
      console.log("🚀 Booting Microservices...");
      
      const child = spawn('npm', ['run', 'dev:services'], { stdio: 'inherit', shell: true });

      cloudflared.on('close', () => {
        console.log("Tunnel closed.");
        child.kill();
      });
    }
  }
});