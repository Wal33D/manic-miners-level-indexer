import { InternetArchiveIndexer } from '../src/indexers/archive/InternetArchiveIndexer';
import { logger } from '../src/utils/logger';
import path from 'path';
import fs from 'fs-extra';

const TEST_OUTPUT_DIR = path.join(process.cwd(), 'test-archive-data-v2');
const MAX_ITEMS = 20;

async function testImprovedImageHandling() {
  try {
    logger.info(`=== Testing Improved Internet Archive Image Handling (${MAX_ITEMS} items) ===`);

    // Clean up test directory
    await fs.remove(TEST_OUTPUT_DIR);
    await fs.ensureDir(TEST_OUTPUT_DIR);

    // Create config
    const config = {
      enabled: true,
      baseUrl: 'https://archive.org',
      searchQueries: ['manic miners level'],
      maxConcurrentMetadata: 5,
      maxConcurrentDownloads: 3,
      skipExisting: false,
    };

    // Initialize the indexer
    const indexer = new InternetArchiveIndexer(config, TEST_OUTPUT_DIR);

    // Statistics tracking
    const stats = {
      totalItems: 0,
      itemsWithScreenshots: 0,
      itemsWithThumbnails: 0,
      itemsWithBoth: 0,
      itemsWithNeither: 0,
      failureReasons: {
        nodatfiles: 0,
        noimages: 0,
        error: 0,
      },
    };

    // Monkey patch to limit items and track details
    let itemsProcessed = 0;
    const originalProcessCompleteItem = (indexer as any).processCompleteItem;
    (indexer as any).processCompleteItem = async function (metadata: any) {
      if (itemsProcessed >= MAX_ITEMS) {
        return false;
      }

      itemsProcessed++;
      logger.info(`\n📦 Processing item ${itemsProcessed}/${MAX_ITEMS}: ${metadata.title}`);

      try {
        // Fetch details to analyze
        const details = await this.metadataFetcher.fetchItemDetails(metadata.identifier);
        if (!details) {
          logger.warn(`  ❌ No details available`);
          stats.failureReasons.error++;
          return false;
        }

        // Check for DAT files
        const datFiles = details.files.filter(
          (file: any) => file.name.toLowerCase().endsWith('.dat') || file.format === 'dat'
        );

        if (datFiles.length === 0) {
          logger.debug(`  ❌ No .dat files found`);
          stats.failureReasons.nodatfiles++;
          return false;
        }

        // Display image analysis
        const images = (indexer as any).categorizeImages(details.files);
        const imageFiles = details.files.filter((file: any) => {
          const name = file.name.toLowerCase();
          return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
        });

        logger.info(`\n📷 Available images in this item:`);
        imageFiles.forEach((file: any) => {
          const size = parseInt(file.size || '0');
          logger.info(`  - ${file.name} (${(size / 1024).toFixed(1)} KB)`);
        });

        if (images.screenshots.length > 0 || images.thumbnails.length > 0) {
          if (images.screenshots.length > 0) {
            logger.info(`  📸 Screenshots selected:`);
            logger.info(
              `     - ${images.screenshots[0].name} → screenshot${path.extname(images.screenshots[0].name)}`
            );
          }
          if (images.thumbnails.length > 0) {
            logger.info(`  📱 Thumbnail selected:`);
            logger.info(
              `     - ${images.thumbnails[0].name} → thumb${path.extname(images.thumbnails[0].name)}`
            );
          }
        } else {
          logger.info(`  ❌ No suitable images found`);
          stats.failureReasons.noimages++;
        }

        // Process the item
        const result = await originalProcessCompleteItem.apply(this, [metadata]);

        // Update statistics
        if (result) {
          stats.totalItems++;
          const hasScreenshot = images.screenshots.length > 0;
          const hasThumb = images.thumbnails.length > 0;

          if (hasScreenshot) stats.itemsWithScreenshots++;
          if (hasThumb) stats.itemsWithThumbnails++;
          if (hasScreenshot && hasThumb) stats.itemsWithBoth++;
          if (!hasScreenshot && !hasThumb) stats.itemsWithNeither++;
        }

        return result;
      } catch (error) {
        logger.error(`  ❌ Error processing: ${error}`);
        stats.failureReasons.error++;
        return false;
      }
    };

    // Run the indexer
    logger.info('\nStarting indexing...\n');
    const startTime = Date.now();
    const result = await indexer.indexArchive();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Display results
    logger.info(`\n=== Indexing Complete in ${duration}s ===`);
    logger.info(`✅ Levels processed: ${result.levelsProcessed}`);
    logger.info(`⏭️  Levels skipped: ${result.levelsSkipped}`);
    logger.info(`❌ Errors: ${result.errors.length}`);

    // Display statistics
    logger.info('\n=== Image Download Statistics ===');
    logger.info(`📊 Total successful items: ${stats.totalItems}`);
    logger.info(
      `📸 Items with screenshots: ${stats.itemsWithScreenshots} (${((stats.itemsWithScreenshots / stats.totalItems) * 100).toFixed(0)}%)`
    );
    logger.info(
      `📱 Items with thumbnails: ${stats.itemsWithThumbnails} (${((stats.itemsWithThumbnails / stats.totalItems) * 100).toFixed(0)}%)`
    );
    logger.info(
      `✅ Items with both: ${stats.itemsWithBoth} (${((stats.itemsWithBoth / stats.totalItems) * 100).toFixed(0)}%)`
    );
    logger.info(`❌ Items with neither: ${stats.itemsWithNeither}`);

    logger.info('\n=== Failure Reasons ===');
    logger.info(`🚫 No DAT files: ${stats.failureReasons.nodatfiles}`);
    logger.info(`🖼️  No images: ${stats.failureReasons.noimages}`);
    logger.info(`❌ Processing errors: ${stats.failureReasons.error}`);

    // Verify file naming
    logger.info('\n=== File Naming Verification ===');
    const levelDirs = await fs.readdir(path.join(TEST_OUTPUT_DIR, 'levels-archive'));

    for (const dir of levelDirs.slice(0, 5)) {
      const files = await fs.readdir(path.join(TEST_OUTPUT_DIR, 'levels-archive', dir));
      const catalogPath = path.join(TEST_OUTPUT_DIR, 'levels-archive', dir, 'catalog.json');
      const catalog = await fs.readJSON(catalogPath);

      logger.info(`\n📁 ${catalog.metadata.title}`);
      logger.info(`   Files:`);

      for (const file of files.sort()) {
        if (file.match(/\.(png|jpg|jpeg)$/i)) {
          const stats = await fs.stat(path.join(TEST_OUTPUT_DIR, 'levels-archive', dir, file));
          const emoji = file.startsWith('screenshot')
            ? '📸'
            : file.startsWith('thumb')
              ? '📱'
              : '🖼️';
          logger.info(`   ${emoji} ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
        }
      }
    }
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

// Run the test
testImprovedImageHandling().catch(console.error);
