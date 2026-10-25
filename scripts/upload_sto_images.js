const { v2: cloudinary } = require('cloudinary');
const path = require('path');
const fs = require('fs');

cloudinary.config({
  cloud_name: 'micb9okr',
  api_key: '448699619328252',
  api_secret: 'jFKL1pJGw3cFdiboSuxa8myWROQ',
  secure: true,
});

async function uploadFile(filePath, publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      {
        folder: 'selfstorage/storage_units',
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
  });
}

async function main() {
  const publicDir = path.resolve(__dirname, '../../SelfStorage-FE/public');
  const files = [
    { name: 'sto1.png', id: 'unit_sto1' },
    { name: 'sto2.png', id: 'unit_sto2' },
    { name: 'sto3.png', id: 'unit_sto3' },
  ];

  const results = {};
  for (const f of files) {
    const fullPath = path.join(publicDir, f.name);
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${fullPath}`);
      continue;
    }
    console.log(`Uploading ${f.name} to Cloudinary...`);
    const res = await uploadFile(fullPath, f.id);
    console.log(`Uploaded ${f.name} -> ${res.secure_url}`);
    results[f.name] = res.secure_url;
  }

  console.log('UPLOAD COMPLETE:', JSON.stringify(results, null, 2));
}

main().catch(console.error);
