/**
 * Debug script to list available Gemini models for your API key
 * Usage: node scripts/check-gemini-models.js
 */

const fs = require('fs');
const path = require('path');

// Load .env.local file manually
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (key && value) {
        process.env[key] = value;
      }
    }
  });
}

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error('❌ Error: GOOGLE_API_KEY is not set in .env.local');
    process.exit(1);
  }

  console.log('🔍 Checking available Gemini models for your API key...\n');

  try {
    // Use the REST API directly to list models
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();

    if (!data.models || data.models.length === 0) {
      console.log('⚠️  No models found in response');
      return;
    }

    console.log('✅ AVAILABLE GEMINI MODELS:\n');
    
    const geminiModels = data.models
      .filter(m => m.name && m.name.includes('gemini'))
      .map(m => ({
        name: m.name.replace('models/', ''),
        displayName: m.displayName || m.name,
        supportedMethods: m.supportedGenerationMethods || [],
        description: m.description || ''
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (geminiModels.length === 0) {
      console.log('⚠️  No Gemini models found. Your API key may not have access to Gemini models.');
      return;
    }

    geminiModels.forEach(model => {
      console.log(`📌 ${model.name}`);
      if (model.displayName !== model.name) {
        console.log(`   Display Name: ${model.displayName}`);
      }
      if (model.supportedMethods.length > 0) {
        console.log(`   Methods: ${model.supportedMethods.join(', ')}`);
      }
      if (model.description) {
        console.log(`   Description: ${model.description.substring(0, 100)}...`);
      }
      console.log('');
    });

    // Recommend models
    console.log('\n💡 RECOMMENDATIONS:');
    const proModels = geminiModels.filter(m => m.name.includes('pro'));
    const flashModels = geminiModels.filter(m => m.name.includes('flash'));

    if (proModels.length > 0) {
      const latestPro = proModels[proModels.length - 1];
      console.log(`   ✅ Use "${latestPro.name}" for best accuracy (recommended)`);
    }

    if (flashModels.length > 0) {
      const latestFlash = flashModels[flashModels.length - 1];
      console.log(`   ⚡ Use "${latestFlash.name}" for faster/cheaper extraction`);
    }

    if (proModels.length === 0 && flashModels.length === 0) {
      console.log('   ⚠️  No Pro or Flash models found. Check your API key permissions.');
    }

  } catch (error) {
    console.error('❌ Error listing models:', error.message);
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('\n💡 This usually means:');
      console.error('   1. Your API key is invalid');
      console.error('   2. The Generative Language API is not enabled for your project');
      console.error('   3. Your API key does not have the required permissions');
      console.error('\n   Check: https://console.cloud.google.com/apis/credentials');
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

