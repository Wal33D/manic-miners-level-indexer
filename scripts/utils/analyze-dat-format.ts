import fs from 'fs-extra';
import path from 'path';

async function analyzeDatFormat() {
  // Create a test directory
  const testDir = path.join(process.cwd(), 'test-format');
  await fs.ensureDir(testDir);

  // Sample v2 text-based DAT content based on what we saw
  const sampleV2Content = `comments{
}
info{
rowcount:34
colcount:34
camerapos:Translation: X=1699.998 Y=1629.990 Z=0.000 Rotation: P=-45.000002 Y=0.000000 R=0.000000 Scale X=1.000 Y=1.000 Z=1.000
biome:rock
creator:hoooper
}
tiles{
32,16,32,16,32,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,16,32,16,32,16,32
16,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,16
32,26,30,30,30,30,30,30,30,30,30,30,30,42,1,1,1,1,1,1,42,30,30,30,30,30,30,30,30,30,30,30,26,32
16,26,30,30,30,30,30,30,30,30,30,30,30,34,6,6,6,6,6,6,34,30,30,30,30,30,30,30,30,30,30,30,26,16
32,26,30,30,30,30,30,30,30,30,30,30,30,42,1,1,1,1,1,1,42,30,30,30,30,30,30,30,30,30,30,30,26,32
8,26,30,30,30,30,30,30,30,30,30,30,30,34,6,6,6,6,6,6,34,30,30,30,30,30,30,30,30,30,30,30,26,8
}
height{
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,5,5,5,5,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0
}
resources{
}
objectives{
}
buildings{
}
landslidefrequency{
}
lavaspread{
}
miners{
}
briefing{
}
briefingsuccess{
}
briefingfailure{
}
vehicles{
}
`;

  // Save sample file
  const samplePath = path.join(testDir, 'sample-v2.dat');
  await fs.writeFile(samplePath, sampleV2Content);

  console.log('Sample v2 DAT file created at:', samplePath);
  console.log('\n=== V2 Format Structure ===');
  console.log('1. Text-based format with sections enclosed in {}');
  console.log('2. Main sections:');
  console.log('   - comments: User comments');
  console.log('   - info: Map metadata (dimensions, camera, biome, creator)');
  console.log('   - tiles: Comma-separated tile type values');
  console.log('   - height: Comma-separated height values');
  console.log('   - resources: Resource placements');
  console.log('   - objectives: Level objectives');
  console.log('   - buildings: Pre-placed buildings');
  console.log('   - Various other game settings');
  console.log('\n3. Tiles are numeric values representing different tile types');
  console.log('4. Each row is comma-separated, rows are newline-separated');
}

analyzeDatFormat().catch(console.error);
