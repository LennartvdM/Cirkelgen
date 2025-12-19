/**
 * Cirkelgen - Radial Chart Visualization with Konva.js
 *
 * Interactive animated radial chart displaying performance data across 6 categories.
 * Features: staggered clockwise animations, hover tooltips, layered rendering.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // Display settings
  displaySize: 500,

  // Chart geometry
  totalLayers: 67,
  centerHole: 18,
  ringThickness: 10,
  gapThickness: 3,
  sliceGapThickness: 3,
  numCategories: 6,
  numTiers: 4,

  // Colors
  backgroundColors: ['#F2F2F2', '#e6e6e6', '#cccccc', '#999999'],
  scoreColors: ['#CEE5DA', '#6EC5CD', '#076C98', '#182E57'],
  benchmarkColor: '#F47B54',
  averageColor: '#FFFF00',
  averageStrokeColor: '#444444',

  // Animation timing
  animationDuration: 1200,
  gridAnimationDuration: 1800,
  sliceStaggerDelay: 150,  // Delay between each slice starting
  sliceOverlap: 0.6,       // How much slices overlap (0-1, higher = more overlap)
  tierStaggerDelay: 60,    // Delay between tiers within a slice

  // Category labels (Dutch)
  categoryLabels: [
    'klimaat',
    'leiderschap',
    'strategie en\nmanagement',
    'HR management',
    'communicatie',
    'kennis en\nvaardigheden'
  ]
};

// =============================================================================
// STATE
// =============================================================================

let stage, backgroundLayer, scoreLayer, benchmarkLayer, averageLayer, labelLayer, tooltipLayer;
let tooltip;
let showBenchmark = true;
let showAverage = true;
let showValues = false;
let showLabels = true;
let isAnimating = false;
let gridAnimationRef = null;
let dataAnimationRef = null;

// Value label customization
let valueAngleOffset = 0;
let valueFontSize = 14;
let valueDistancePercent = 100;

// =============================================================================
// EASING FUNCTIONS
// =============================================================================

const Easing = {
  // Standard ease out cubic
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),

  // Elastic bounce for playful effect
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },

  // Smooth ease out with overshoot
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },

  // Quick start, smooth end
  easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),

  // Exponential ease out
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),

  // Sine ease for smooth motion
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),

  // Combined ease for building effect
  easeOutCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2))
};

// =============================================================================
// INITIALIZATION
// =============================================================================

function initKonva() {
  const container = document.getElementById('chart-container');

  stage = new Konva.Stage({
    container: 'chart-container',
    width: CONFIG.displaySize,
    height: CONFIG.displaySize
  });

  // Create layers in render order (bottom to top)
  backgroundLayer = new Konva.Layer();
  benchmarkLayer = new Konva.Layer();
  scoreLayer = new Konva.Layer();
  averageLayer = new Konva.Layer();
  labelLayer = new Konva.Layer();
  tooltipLayer = new Konva.Layer();

  stage.add(backgroundLayer);
  stage.add(benchmarkLayer);
  stage.add(scoreLayer);
  stage.add(averageLayer);
  stage.add(labelLayer);
  stage.add(tooltipLayer);

  // Create tooltip
  createTooltip();
}

function createTooltip() {
  const tooltipGroup = new Konva.Group({
    visible: false
  });

  const tooltipBg = new Konva.Rect({
    fill: 'rgba(0, 0, 0, 0.85)',
    cornerRadius: 6,
    padding: 10
  });

  const tooltipText = new Konva.Text({
    text: '',
    fontSize: 14,
    fontFamily: 'Arial',
    fill: 'white',
    padding: 8
  });

  tooltipGroup.add(tooltipBg);
  tooltipGroup.add(tooltipText);
  tooltipLayer.add(tooltipGroup);

  tooltip = {
    group: tooltipGroup,
    bg: tooltipBg,
    text: tooltipText
  };
}

function showTooltip(category, tier, value, type, x, y) {
  const label = CONFIG.categoryLabels[category].replace('\n', ' ');
  const tierLabel = `Ring ${tier + 1}`;
  const typeLabel = type === 'score' ? 'Score' : type === 'benchmark' ? 'Benchmark' : 'Average';

  tooltip.text.text(`${label}\n${tierLabel}: ${value.toFixed(1)} (${typeLabel})`);

  const textWidth = tooltip.text.width();
  const textHeight = tooltip.text.height();

  tooltip.bg.width(textWidth);
  tooltip.bg.height(textHeight);

  // Position tooltip, keeping it within bounds
  let tooltipX = x + 15;
  let tooltipY = y - textHeight / 2;

  if (tooltipX + textWidth > CONFIG.displaySize) {
    tooltipX = x - textWidth - 15;
  }
  if (tooltipY < 0) {
    tooltipY = 5;
  }
  if (tooltipY + textHeight > CONFIG.displaySize) {
    tooltipY = CONFIG.displaySize - textHeight - 5;
  }

  tooltip.group.position({ x: tooltipX, y: tooltipY });
  tooltip.group.visible(true);
  tooltipLayer.batchDraw();
}

function hideTooltip() {
  tooltip.group.visible(false);
  tooltipLayer.batchDraw();
}

// =============================================================================
// GEOMETRY HELPERS
// =============================================================================

function getChartGeometry() {
  const centerX = CONFIG.displaySize / 2;
  const centerY = CONFIG.displaySize / 2;
  const maxRadius = (CONFIG.displaySize / 2) * 0.8;
  const layerThickness = maxRadius / CONFIG.totalLayers;
  const sliceAngle = (Math.PI * 2) / CONFIG.numCategories;
  const rotationAngle = -Math.PI / 2; // Start at top

  return { centerX, centerY, maxRadius, layerThickness, sliceAngle, rotationAngle };
}

function getRingBounds(tierIndex, layerThickness) {
  const startRadius = (CONFIG.centerHole + tierIndex * (CONFIG.ringThickness + CONFIG.gapThickness)) * layerThickness;
  const endRadius = startRadius + CONFIG.ringThickness * layerThickness;
  return { startRadius, endRadius };
}

function createArcPath(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle) {
  // Create a wedge shape using sceneFunc
  return function(context, shape) {
    context.beginPath();
    context.arc(centerX, centerY, outerRadius, startAngle, endAngle);
    context.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    context.closePath();
    context.fillStrokeShape(shape);
  };
}

// =============================================================================
// DRAWING FUNCTIONS
// =============================================================================

/**
 * Draw background with optional per-slice animation progress
 * @param {number[]} sliceProgress - Array of progress values (0-1) for each slice
 * @param {number[]} tierProgress - Array of progress values (0-1) for each tier within slices
 */
function drawBackground(sliceProgress = null, tierProgress = null) {
  backgroundLayer.destroyChildren();

  const { centerX, centerY, layerThickness, sliceAngle, rotationAngle } = getChartGeometry();

  for (let category = 0; category < CONFIG.numCategories; category++) {
    const baseStartAngle = category * sliceAngle + rotationAngle;
    const baseEndAngle = (category + 1) * sliceAngle + rotationAngle;

    // Get slice progress (angle sweep)
    const sliceProg = sliceProgress ? sliceProgress[category] : 1;
    if (sliceProg <= 0) continue;

    // Animate angle sweep clockwise
    const animatedEndAngle = baseStartAngle + (baseEndAngle - baseStartAngle) * Easing.easeOutCubic(sliceProg);

    for (let tier = 0; tier < CONFIG.numTiers; tier++) {
      const { startRadius, endRadius } = getRingBounds(tier, layerThickness);

      // Get tier progress (radial build-out)
      let tierProg = 1;
      if (tierProgress && tierProgress[category]) {
        tierProg = tierProgress[category][tier] || 0;
      }
      if (tierProg <= 0) continue;

      // Animate radius from inner to outer
      const easedTierProg = Easing.easeOutQuart(tierProg);
      const animatedEndRadius = startRadius + (endRadius - startRadius) * easedTierProg;

      const segment = new Konva.Shape({
        sceneFunc: createArcPath(centerX, centerY, startRadius, animatedEndRadius, baseStartAngle, animatedEndAngle),
        fill: CONFIG.backgroundColors[tier]
      });

      backgroundLayer.add(segment);
    }
  }

  // Draw gap lines with fade-in based on max slice progress
  const maxProgress = sliceProgress ? Math.max(...sliceProgress) : 1;
  if (maxProgress > 0.3) {
    drawGapLines(backgroundLayer, Math.min(1, (maxProgress - 0.3) / 0.7));
  }

  backgroundLayer.batchDraw();
}

function drawGapLines(layer, opacity = 1) {
  const { centerX, centerY, maxRadius, sliceAngle, rotationAngle } = getChartGeometry();

  for (let i = 0; i < CONFIG.numCategories; i++) {
    const angle = i * sliceAngle + rotationAngle;

    const gap = new Konva.Line({
      points: [
        centerX,
        centerY,
        centerX + Math.cos(angle) * (maxRadius + 20),
        centerY + Math.sin(angle) * (maxRadius + 20)
      ],
      stroke: 'white',
      strokeWidth: CONFIG.sliceGapThickness * 3,
      opacity: opacity
    });

    layer.add(gap);
  }
}

/**
 * Draw scores with per-slice concentric animation (expands from center)
 * @param {number[]} scores - Score values for each category
 * @param {number|number[]} animationProgress - Global progress or per-slice progress array
 */
function drawScores(scores, animationProgress = 1) {
  scoreLayer.destroyChildren();

  const { centerX, centerY, layerThickness, sliceAngle, rotationAngle } = getChartGeometry();
  const isPerSlice = Array.isArray(animationProgress);

  // Calculate the maximum possible radius for scaling
  const maxTierBounds = getRingBounds(CONFIG.numTiers - 1, layerThickness);
  const maxPossibleRadius = maxTierBounds.endRadius;

  for (let category = 0; category < CONFIG.numCategories; category++) {
    const startAngle = category * sliceAngle + rotationAngle;
    const endAngle = (category + 1) * sliceAngle + rotationAngle;

    // Get progress for this slice
    const sliceProgress = isPerSlice ? animationProgress[category] : animationProgress;
    if (sliceProgress <= 0) continue;

    // Use exponential easing for smooth concentric expansion
    const easedProgress = Easing.easeOutExpo(sliceProgress);

    // Calculate the current maximum radius based on animation progress
    const currentMaxRadius = maxPossibleRadius * easedProgress;

    const score = scores[category];

    for (let tier = 0; tier < CONFIG.numTiers; tier++) {
      const { startRadius, endRadius } = getRingBounds(tier, layerThickness);

      // Skip this tier if animation hasn't reached it yet
      if (startRadius > currentMaxRadius) continue;

      // Calculate filled portion for this tier based on score
      const layersFilled = Math.max(0, Math.min(10, Math.floor(score * 10) - tier * 10));

      if (layersFilled > 0) {
        const fillRatio = layersFilled / 10;
        const targetEndRadius = startRadius + (endRadius - startRadius) * fillRatio;

        // Clamp the end radius to the current animation radius
        const animatedEndRadius = Math.min(targetEndRadius, currentMaxRadius);

        // Only draw if there's something visible
        if (animatedEndRadius > startRadius) {
          const segment = new Konva.Shape({
            sceneFunc: createArcPath(centerX, centerY, startRadius, animatedEndRadius, startAngle, endAngle),
            fill: CONFIG.scoreColors[tier],
            category: category,
            tier: tier,
            value: scores[category],
            type: 'score'
          });

          // Add hover events
          segment.on('mouseenter', function(e) {
            const shape = e.target;
            document.body.style.cursor = 'pointer';
            shape.opacity(0.8);
            scoreLayer.batchDraw();

            const pos = stage.getPointerPosition();
            showTooltip(shape.attrs.category, shape.attrs.tier, shape.attrs.value, 'score', pos.x, pos.y);
          });

          segment.on('mouseleave', function(e) {
            document.body.style.cursor = 'default';
            e.target.opacity(1);
            scoreLayer.batchDraw();
            hideTooltip();
          });

          segment.on('mousemove', function(e) {
            const pos = stage.getPointerPosition();
            showTooltip(e.target.attrs.category, e.target.attrs.tier, e.target.attrs.value, 'score', pos.x, pos.y);
          });

          scoreLayer.add(segment);
        }
      }
    }
  }

  // Draw gap lines on top
  const maxProgress = isPerSlice ? Math.max(...animationProgress) : animationProgress;
  drawGapLines(scoreLayer, maxProgress);
  scoreLayer.batchDraw();
}

/**
 * Draw benchmarks with per-slice concentric animation (expands from center)
 * @param {number[]} benchmarks - Benchmark values for each category
 * @param {number|number[]} animationProgress - Global progress or per-slice progress array
 */
function drawBenchmarks(benchmarks, animationProgress = 1) {
  benchmarkLayer.destroyChildren();

  if (!showBenchmark) {
    benchmarkLayer.batchDraw();
    return;
  }

  const { centerX, centerY, layerThickness, sliceAngle, rotationAngle } = getChartGeometry();
  const isPerSlice = Array.isArray(animationProgress);

  // Calculate the maximum possible radius for scaling
  const maxTierBounds = getRingBounds(CONFIG.numTiers - 1, layerThickness);
  const maxPossibleRadius = maxTierBounds.endRadius;

  for (let category = 0; category < CONFIG.numCategories; category++) {
    const startAngle = category * sliceAngle + rotationAngle;
    const endAngle = (category + 1) * sliceAngle + rotationAngle;

    const sliceProgress = isPerSlice ? animationProgress[category] : animationProgress;
    if (sliceProgress <= 0) continue;

    // Use exponential easing for smooth concentric expansion
    const easedProgress = Easing.easeOutExpo(sliceProgress);

    // Calculate the current maximum radius based on animation progress
    const currentMaxRadius = maxPossibleRadius * easedProgress;

    const benchmark = benchmarks[category];

    for (let tier = 0; tier < CONFIG.numTiers; tier++) {
      const { startRadius, endRadius } = getRingBounds(tier, layerThickness);

      // Skip this tier if animation hasn't reached it yet
      if (startRadius > currentMaxRadius) continue;

      const layersFilled = Math.max(0, Math.min(10, Math.floor(benchmark * 10) - tier * 10));

      if (layersFilled > 0) {
        const fillRatio = layersFilled / 10;
        const targetEndRadius = startRadius + (endRadius - startRadius) * fillRatio;

        // Clamp the end radius to the current animation radius
        const animatedEndRadius = Math.min(targetEndRadius, currentMaxRadius);

        // Only draw if there's something visible
        if (animatedEndRadius > startRadius) {
          const segment = new Konva.Shape({
            sceneFunc: createArcPath(centerX, centerY, startRadius, animatedEndRadius, startAngle, endAngle),
            fill: CONFIG.benchmarkColor,
            category: category,
            tier: tier,
            value: benchmarks[category],
            type: 'benchmark'
          });

          segment.on('mouseenter', function(e) {
            const shape = e.target;
            document.body.style.cursor = 'pointer';
            shape.opacity(0.8);
            benchmarkLayer.batchDraw();

            const pos = stage.getPointerPosition();
            showTooltip(shape.attrs.category, shape.attrs.tier, shape.attrs.value, 'benchmark', pos.x, pos.y);
          });

          segment.on('mouseleave', function(e) {
            document.body.style.cursor = 'default';
            e.target.opacity(1);
            benchmarkLayer.batchDraw();
            hideTooltip();
          });

          segment.on('mousemove', function(e) {
            const pos = stage.getPointerPosition();
            showTooltip(e.target.attrs.category, e.target.attrs.tier, e.target.attrs.value, 'benchmark', pos.x, pos.y);
          });

          benchmarkLayer.add(segment);
        }
      }
    }
  }

  benchmarkLayer.batchDraw();
}

/**
 * Draw averages with per-slice animation support
 * @param {number[]} averages - Average values for each category
 * @param {number|number[]} animationProgress - Global progress or per-slice progress array
 */
function drawAverages(averages, animationProgress = 1) {
  averageLayer.destroyChildren();

  if (!showAverage) {
    averageLayer.batchDraw();
    return;
  }

  const { centerX, centerY, layerThickness, sliceAngle, rotationAngle } = getChartGeometry();
  const isPerSlice = Array.isArray(animationProgress);

  for (let category = 0; category < CONFIG.numCategories; category++) {
    const startAngle = category * sliceAngle + rotationAngle;
    const endAngle = (category + 1) * sliceAngle + rotationAngle;
    const average = averages[category];

    if (average <= 0) continue;

    const sliceProgress = isPerSlice ? animationProgress[category] : animationProgress;
    if (sliceProgress <= 0) continue;

    const easedProgress = Easing.easeOutBack(sliceProgress); // Use back easing for bouncy effect

    // Calculate layer position
    const averageLayer_idx = Math.floor(average * 10) - 1;
    if (averageLayer_idx < 0) continue;

    const tierIndex = Math.floor(averageLayer_idx / 10);
    const layerWithinTier = averageLayer_idx % 10;
    const actualLayer = CONFIG.centerHole + tierIndex * (CONFIG.ringThickness + CONFIG.gapThickness) + layerWithinTier;

    // Calculate indicator geometry
    const baseRadius = actualLayer * layerThickness;
    const midRadius = baseRadius + layerThickness / 2;

    // Pill-shaped indicator with circular end caps
    const protrusion = 10;
    const protrusionAngle = Math.asin(protrusion / midRadius);
    const midAngle = (startAngle + endAngle) / 2;

    // Animated position (grows from center)
    const animatedRadius = midRadius * easedProgress;

    if (sliceProgress > 0.1) {
      const circleRadius = layerThickness * 0.6;
      const scaledCircleRadius = circleRadius * Math.min(1, easedProgress);

      // Start circle
      const startCircle = new Konva.Circle({
        x: centerX + animatedRadius * Math.cos(midAngle - protrusionAngle),
        y: centerY + animatedRadius * Math.sin(midAngle - protrusionAngle),
        radius: scaledCircleRadius,
        fill: CONFIG.averageColor,
        stroke: CONFIG.averageStrokeColor,
        strokeWidth: 2,
        category: category,
        tier: tierIndex,
        value: average,
        type: 'average'
      });

      // End circle
      const endCircle = new Konva.Circle({
        x: centerX + animatedRadius * Math.cos(midAngle + protrusionAngle),
        y: centerY + animatedRadius * Math.sin(midAngle + protrusionAngle),
        radius: scaledCircleRadius,
        fill: CONFIG.averageColor,
        stroke: CONFIG.averageStrokeColor,
        strokeWidth: 2
      });

      // Connecting arc
      const arcShape = new Konva.Shape({
        sceneFunc: function(context, shape) {
          const innerR = animatedRadius - scaledCircleRadius;
          const outerR = animatedRadius + scaledCircleRadius;

          context.beginPath();
          context.arc(centerX, centerY, outerR, midAngle - protrusionAngle, midAngle + protrusionAngle);
          context.arc(centerX, centerY, innerR, midAngle + protrusionAngle, midAngle - protrusionAngle, true);
          context.closePath();
          context.fillStrokeShape(shape);
        },
        fill: CONFIG.averageColor,
        stroke: CONFIG.averageStrokeColor,
        strokeWidth: 2
      });

      // Add hover events to all parts
      [startCircle, endCircle, arcShape].forEach(shape => {
        shape.on('mouseenter', function(e) {
          document.body.style.cursor = 'pointer';
          const pos = stage.getPointerPosition();
          showTooltip(category, tierIndex, average, 'average', pos.x, pos.y);
        });

        shape.on('mouseleave', function() {
          document.body.style.cursor = 'default';
          hideTooltip();
        });

        shape.on('mousemove', function() {
          const pos = stage.getPointerPosition();
          showTooltip(category, tierIndex, average, 'average', pos.x, pos.y);
        });
      });

      averageLayer.add(arcShape);
      averageLayer.add(startCircle);
      averageLayer.add(endCircle);
    }
  }

  averageLayer.batchDraw();
}

function drawLabels() {
  labelLayer.destroyChildren();

  const { centerX, centerY, maxRadius, sliceAngle, rotationAngle } = getChartGeometry();

  // Draw category labels (axis names) if enabled
  if (showLabels) {
    for (let category = 0; category < CONFIG.numCategories; category++) {
      const midAngle = category * sliceAngle + sliceAngle / 2 + rotationAngle;
      const labelRadius = maxRadius + 30;

      const x = centerX + labelRadius * Math.cos(midAngle);
      const y = centerY + labelRadius * Math.sin(midAngle);

      // Calculate rotation for label to follow circle
      let rotation = (midAngle * 180 / Math.PI) + 90;

      // Flip text on left side so it's readable
      if (midAngle > Math.PI / 2 && midAngle < Math.PI * 1.5) {
        rotation += 180;
      }

      const label = new Konva.Text({
        x: x,
        y: y,
        text: CONFIG.categoryLabels[category],
        fontSize: 12,
        fontFamily: 'Arial',
        fontStyle: 'bold',
        fill: '#076C98',
        align: 'center',
        offsetX: 40,
        offsetY: 10,
        rotation: rotation
      });

      labelLayer.add(label);
    }
  }

  // Draw value labels if enabled
  if (showValues) {
    const scores = getValues('scoreInputs');
    drawValueLabels(scores);
  }

  labelLayer.batchDraw();
}

function drawValueLabels(scores) {
  const { centerX, centerY, layerThickness, sliceAngle, rotationAngle } = getChartGeometry();

  // Position in gap between 3rd and 4th rings
  const thirdRingOuter = (CONFIG.centerHole + 3 * (CONFIG.ringThickness + CONFIG.gapThickness)) * layerThickness;
  let gapCenterRadius = thirdRingOuter * (valueDistancePercent / 100);

  for (let category = 0; category < CONFIG.numCategories; category++) {
    const angle = category * sliceAngle + sliceAngle / 2 + rotationAngle + (valueAngleOffset * Math.PI / 180);
    const x = centerX + gapCenterRadius * Math.cos(angle);
    const y = centerY + gapCenterRadius * Math.sin(angle);

    const valueText = new Konva.Text({
      x: x,
      y: y,
      text: scores[category].toFixed(1),
      fontSize: valueFontSize,
      fontFamily: 'Arial',
      fontStyle: 'bold',
      fill: 'white',
      stroke: 'black',
      strokeWidth: 1,
      align: 'center',
      offsetX: valueFontSize / 2,
      offsetY: valueFontSize / 2
    });

    labelLayer.add(valueText);
  }
}

// =============================================================================
// ANIMATION
// =============================================================================

/**
 * Calculate staggered progress for each slice (clockwise with overlap)
 * @param {number} elapsed - Elapsed time in ms
 * @param {number} duration - Total animation duration
 * @param {number} staggerDelay - Delay between each slice starting
 * @returns {number[]} Array of progress values (0-1) for each slice
 */
function calculateSliceProgress(elapsed, duration, staggerDelay) {
  const sliceProgress = [];
  const overlap = CONFIG.sliceOverlap;
  const effectiveSliceDuration = duration * (1 - overlap * 0.5);

  for (let i = 0; i < CONFIG.numCategories; i++) {
    const sliceStart = i * staggerDelay;
    const sliceElapsed = Math.max(0, elapsed - sliceStart);
    const progress = Math.min(1, sliceElapsed / effectiveSliceDuration);
    sliceProgress.push(progress);
  }

  return sliceProgress;
}

/**
 * Calculate tier progress within each slice (outward building)
 * @param {number[]} sliceProgress - Progress for each slice
 * @returns {number[][]} 2D array of tier progress for each slice
 */
function calculateTierProgress(sliceProgress) {
  const tierProgress = [];

  for (let i = 0; i < CONFIG.numCategories; i++) {
    const sliceProg = sliceProgress[i];
    const tiers = [];

    for (let t = 0; t < CONFIG.numTiers; t++) {
      // Tiers build outward with slight delay
      const tierDelay = t * 0.15; // 15% delay per tier
      const tierProg = Math.max(0, Math.min(1, (sliceProg - tierDelay) / (1 - tierDelay)));
      tiers.push(tierProg);
    }

    tierProgress.push(tiers);
  }

  return tierProgress;
}

/**
 * Animate just the grid (background) with staggered clockwise building
 */
function animateGrid() {
  if (gridAnimationRef) {
    gridAnimationRef.stop();
  }

  const startTime = performance.now();
  const duration = CONFIG.gridAnimationDuration;
  const staggerDelay = CONFIG.sliceStaggerDelay;

  // Clear background first
  backgroundLayer.destroyChildren();
  backgroundLayer.batchDraw();

  gridAnimationRef = new Konva.Animation((frame) => {
    const elapsed = performance.now() - startTime;
    const sliceProgress = calculateSliceProgress(elapsed, duration, staggerDelay);
    const tierProgress = calculateTierProgress(sliceProgress);

    drawBackground(sliceProgress, tierProgress);

    // Check if all slices are complete
    const allComplete = sliceProgress.every(p => p >= 1);
    if (allComplete) {
      gridAnimationRef.stop();
      gridAnimationRef = null;
      drawBackground(); // Final clean draw
    }
  }, backgroundLayer);

  gridAnimationRef.start();
}

/**
 * Animate data layers (scores, benchmarks, averages) with staggered clockwise effect
 */
function animateData() {
  if (dataAnimationRef) {
    dataAnimationRef.stop();
  }

  const scores = getValues('scoreInputs');
  const benchmarks = getValues('benchmarkInputs');
  const averages = getValues('averageInputs');

  const startTime = performance.now();
  const duration = CONFIG.animationDuration;
  const staggerDelay = CONFIG.sliceStaggerDelay;

  // Clear data layers first
  scoreLayer.destroyChildren();
  benchmarkLayer.destroyChildren();
  averageLayer.destroyChildren();
  labelLayer.destroyChildren();
  scoreLayer.batchDraw();
  benchmarkLayer.batchDraw();
  averageLayer.batchDraw();
  labelLayer.batchDraw();

  dataAnimationRef = new Konva.Animation((frame) => {
    const elapsed = performance.now() - startTime;
    const sliceProgress = calculateSliceProgress(elapsed, duration, staggerDelay);

    // Draw data with per-slice progress
    if (showBenchmark) {
      drawBenchmarks(benchmarks, sliceProgress);
    }
    drawScores(scores, sliceProgress);
    if (showAverage) {
      drawAverages(averages, sliceProgress);
    }

    // Check if all slices are complete
    const allComplete = sliceProgress.every(p => p >= 1);
    if (allComplete) {
      dataAnimationRef.stop();
      dataAnimationRef = null;
      // Final clean draw
      if (showBenchmark) {
        drawBenchmarks(benchmarks);
      }
      drawScores(scores);
      if (showAverage) {
        drawAverages(averages);
      }
      drawLabels();
    }
  }, scoreLayer);

  dataAnimationRef.start();
}

/**
 * Full chart animation - grid first, then data with overlap
 */
function animateChart(scores, benchmarks, averages) {
  if (isAnimating) return;
  isAnimating = true;

  // Stop any existing animations
  if (gridAnimationRef) gridAnimationRef.stop();
  if (dataAnimationRef) dataAnimationRef.stop();

  const startTime = performance.now();
  const gridDuration = CONFIG.gridAnimationDuration;
  const dataDuration = CONFIG.animationDuration;
  const staggerDelay = CONFIG.sliceStaggerDelay;
  const dataStartDelay = gridDuration * 0.3; // Data starts after 30% of grid animation

  // Clear all layers
  backgroundLayer.destroyChildren();
  scoreLayer.destroyChildren();
  benchmarkLayer.destroyChildren();
  averageLayer.destroyChildren();
  labelLayer.destroyChildren();
  backgroundLayer.batchDraw();
  scoreLayer.batchDraw();
  benchmarkLayer.batchDraw();
  averageLayer.batchDraw();
  labelLayer.batchDraw();

  const animation = new Konva.Animation((frame) => {
    const elapsed = performance.now() - startTime;

    // Grid animation
    const gridSliceProgress = calculateSliceProgress(elapsed, gridDuration, staggerDelay);
    const gridTierProgress = calculateTierProgress(gridSliceProgress);
    drawBackground(gridSliceProgress, gridTierProgress);

    // Data animation (starts with delay)
    const dataElapsed = Math.max(0, elapsed - dataStartDelay);
    if (dataElapsed > 0) {
      const dataSliceProgress = calculateSliceProgress(dataElapsed, dataDuration, staggerDelay);

      if (showBenchmark) {
        drawBenchmarks(benchmarks, dataSliceProgress);
      }
      drawScores(scores, dataSliceProgress);
      if (showAverage) {
        drawAverages(averages, dataSliceProgress);
      }
    }

    // Check if everything is complete
    const gridComplete = gridSliceProgress.every(p => p >= 1);
    const dataElapsedForCheck = Math.max(0, elapsed - dataStartDelay);
    const dataSliceProgressForCheck = calculateSliceProgress(dataElapsedForCheck, dataDuration, staggerDelay);
    const dataComplete = dataSliceProgressForCheck.every(p => p >= 1);

    if (gridComplete && dataComplete) {
      animation.stop();
      isAnimating = false;
      // Final clean draw
      drawBackground();
      if (showBenchmark) {
        drawBenchmarks(benchmarks);
      }
      drawScores(scores);
      if (showAverage) {
        drawAverages(averages);
      }
      drawLabels();
    }
  }, backgroundLayer);

  animation.start();
}

/**
 * Generate random values and fill inputs
 */
function generateRandomValues() {
  const sections = ['scoreInputs', 'benchmarkInputs', 'averageInputs'];

  sections.forEach(sectionId => {
    const inputs = document.querySelectorAll(`#${sectionId} input`);
    inputs.forEach(input => {
      // Generate random value between 0.5 and 4.0, rounded to 1 decimal
      const randomValue = (Math.random() * 3.5 + 0.5).toFixed(1);
      input.value = randomValue;
    });
  });

  // Animate with the new values
  updateChart(true);
}

function updateChart(animate = false) {
  const scores = getValues('scoreInputs');
  const benchmarks = getValues('benchmarkInputs');
  const averages = getValues('averageInputs');

  if (animate) {
    animateChart(scores, benchmarks, averages);
  } else {
    drawBackground();
    drawBenchmarks(benchmarks);
    drawScores(scores);
    drawAverages(averages);
    drawLabels();
  }
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

function createInputs() {
  const sections = ['scoreInputs', 'benchmarkInputs', 'averageInputs'];
  sections.forEach((sectionId) => {
    const container = document.getElementById(sectionId);
    for (let i = 0; i < 6; i++) {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '4';
      input.step = '0.1';
      input.value = '0';
      input.placeholder = `${i + 1}`;
      input.addEventListener('input', () => updateChart(false));
      container.appendChild(input);
    }
  });
}

function getValues(sectionId) {
  return Array.from(document.querySelectorAll(`#${sectionId} input`)).map(
    (input) => {
      let value = parseFloat(input.value);
      return isNaN(value) ? 0 : Math.max(0, Math.min(4, value));
    }
  );
}

function toggleVisibility(elementId) {
  if (elementId === 'toggleBenchmark') {
    showBenchmark = !showBenchmark;
  } else if (elementId === 'toggleAverage') {
    showAverage = !showAverage;
  } else if (elementId === 'toggleValues') {
    showValues = !showValues;
  } else if (elementId === 'toggleLabels') {
    showLabels = !showLabels;
  }
  updateChart(false);
}

function setupValueControls() {
  const angleInput = document.getElementById('valueAngleOffset');
  const fontSizeInput = document.getElementById('valueFontSize');
  const distanceInput = document.getElementById('valueDistance');

  angleInput.addEventListener('input', () => {
    valueAngleOffset = parseFloat(angleInput.value) || 0;
    updateChart(false);
  });

  fontSizeInput.addEventListener('input', () => {
    valueFontSize = parseFloat(fontSizeInput.value) || 14;
    updateChart(false);
  });

  distanceInput.addEventListener('input', () => {
    valueDistancePercent = parseFloat(distanceInput.value) || 100;
    updateChart(false);
  });
}

// =============================================================================
// EXPORT (PNG)
// =============================================================================

function exportAsPNG() {
  const fileName = document.getElementById('fileNameInput').value || 'radial-chart';

  // Export at higher resolution
  const dataURL = stage.toDataURL({ pixelRatio: 3 });
  const link = document.createElement('a');
  link.download = `${fileName}.png`;
  link.href = dataURL;
  link.click();
}

// =============================================================================
// INITIALIZATION
// =============================================================================

window.addEventListener('DOMContentLoaded', () => {
  initKonva();
  createInputs();

  // Initial draw with animation
  updateChart(true);

  setupValueControls();

  // Toggle buttons
  document.getElementById('toggleBenchmark').addEventListener('click', () => {
    toggleVisibility('toggleBenchmark');
  });

  document.getElementById('toggleAverage').addEventListener('click', () => {
    toggleVisibility('toggleAverage');
  });

  document.getElementById('toggleValues').addEventListener('click', () => {
    toggleVisibility('toggleValues');
  });

  document.getElementById('toggleLabels').addEventListener('click', () => {
    toggleVisibility('toggleLabels');
  });

  // Animation control buttons
  document.getElementById('replayAnimation').addEventListener('click', () => {
    updateChart(true);
  });

  document.getElementById('animateGrid').addEventListener('click', () => {
    animateGrid();
  });

  document.getElementById('animateData').addEventListener('click', () => {
    animateData();
  });

  document.getElementById('randomValues').addEventListener('click', () => {
    generateRandomValues();
  });

  // Export button
  document.getElementById('exportPNG').addEventListener('click', exportAsPNG);
});
