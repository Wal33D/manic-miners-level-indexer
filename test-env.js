require('dotenv').config();

console.log('Testing environment variables:');
console.log('DISCORD_EMAIL:', process.env.DISCORD_EMAIL ? '✓ Loaded' : '✗ Not found');
console.log('DISCORD_PASSWORD:', process.env.DISCORD_PASSWORD ? '✓ Loaded' : '✗ Not found');