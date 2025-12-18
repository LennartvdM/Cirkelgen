/**
 * Cirkelgen - Radial Chart Visualization Tool
 *
 * This module renders an interactive multi-layered circular chart that displays
 * performance data across 6 categories, each with 4 concentric rings (tiers).
 *
 * The chart visualizes three types of data:
 * - Scores: Primary metric values (0-4 scale, shown in blue gradient)
 * - Benchmarks: Target/comparison values (shown in orange)
 * - Averages: Average indicators with protruding ends (shown in yellow)
 *
 * Architecture:
 * - Uses HTML5 Canvas for rendering at high resolution (6x scale)
 * - CSS scales canvas down for display while maintaining crisp exports
 * - SVG overlay provides category labels
 *
 * Data Flow:
 * User Input -> Event Listeners -> updateChart() -> getValues() -> drawChart() -> Canvas
 */

// =============================================================================
// GLOBAL CONFIGURATION
// =============================================================================

/**
 * Rendering scale factor for high-resolution canvas.
 * Canvas is rendered at 6x display size for crisp visuals and exports.
 */
const scale = 6;

/** Display size of the chart in CSS pixels */
const displaySize = 500;

/** Actual canvas size in pixels (displaySize * scale for high-DPI rendering) */
const canvasSize = displaySize * scale;

/** Scale factor for PNG exports (2x for even higher resolution output) */
const exportScale = 2;

// =============================================================================
// CANVAS SETUP
// =============================================================================

/**
 * Initialize canvas with high-resolution rendering.
 * The canvas is sized larger than display to enable sharp rendering,
 * then scaled down via CSS for display.
 */
const canvas = document.getElementById("radialChart");
canvas.width = canvasSize;
canvas.height = canvasSize;
canvas.style.width = `${displaySize}px`;
canvas.style.height = `${displaySize}px`;

/** 2D rendering context with transparency enabled */
const ctx = canvas.getContext("2d", { alpha: true });
ctx.clearRect(0, 0, canvasSize, canvasSize);

// =============================================================================
// CHART GEOMETRY CONSTANTS
// =============================================================================

/** Center X coordinate of the chart (canvas center) */
const centerX = canvasSize / 2;

/** Center Y coordinate of the chart (canvas center) */
const centerY = canvasSize / 2;

/**
 * Total number of radial layers in the chart geometry.
 * Calculated as: centerHole + (4 rings × ringThickness) + (3 gaps × gapThickness)
 * This determines the granularity of the radial divisions.
 */
const totalLayers = 67;

/**
 * Number of layers reserved for the empty center hole.
 * Creates the "donut" shape of the chart.
 */
const centerHole = 18;

/**
 * Thickness of each data ring in layer units.
 * Each of the 4 tiers spans this many layers.
 */
const ringThickness = 10;

/**
 * Thickness of gaps between rings in layer units.
 * Creates visual separation between the 4 tiers.
 */
const gapThickness = 3;

/**
 * Thickness of gaps between the 6 category slices in layer units.
 * Creates visual separation between category wedges.
 */
const sliceGapThickness = 3;

// =============================================================================
// COLOR DEFINITIONS
// =============================================================================

/**
 * Background colors for the 4 ring tiers (grayscale gradient).
 * Index 0 = outermost/lightest, Index 3 = innermost/darkest
 */
const colors = ["#F2F2F2", "#e6e6e6", "#cccccc", "#999999"];

/**
 * Score fill colors for the 4 ring tiers (blue gradient).
 * Represents filled portions based on score values.
 * Index 0 = tier 1 (0-1), Index 3 = tier 4 (3-4)
 */
const blueColors = ["#CEE5DA", "#6EC5CD", "#076C98", "#182E57"];

/** Color for benchmark indicators (orange) */
const benchmarkColor = "#F47B54";

/** Fill color for average indicators (yellow) */
const averageColor = "#FFFF00";

/** Stroke/outline color for average indicators (dark gray) */
const averageStrokeColor = "#444444";

// =============================================================================
// VISIBILITY STATE FLAGS
// =============================================================================

/** Whether to display benchmark overlay on the chart */
let showBenchmark = true;

/** Whether to display average indicators on the chart */
let showAverage = true;

/** Whether to display numeric score values on the chart */
let showValues = false;

/** Vertical offset for SVG overlay positioning (in pixels) */
let svgVerticalOffset = 10;

// =============================================================================
// VALUE LABEL CUSTOMIZATION
// =============================================================================

/** Angular offset for value labels in degrees (rotates all labels around center) */
let valueAngleOffset = 0;

/** Font size for value labels in pixels */
let valueFontSize = 60;

/** Distance of value labels from center as percentage of default position */
let valueDistancePercent = 100;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Loads an SVG file as an Image object for canvas rendering.
 *
 * @param {string} url - Path to the SVG file
 * @returns {Promise<HTMLImageElement>} Promise resolving to loaded image
 */
function loadSVG(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// =============================================================================
// DRAWING PRIMITIVES
// =============================================================================

/**
 * Draws a wedge-shaped segment (arc with thickness) on the canvas.
 * Used for rendering ring sections for background, scores, and benchmarks.
 *
 * The segment is drawn as a closed path:
 * 1. Move to start point on inner arc
 * 2. Draw outer arc from start to end angle
 * 3. Line to end point on inner arc
 * 4. Draw inner arc back to start (counter-clockwise)
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {number} centerX - X coordinate of chart center
 * @param {number} centerY - Y coordinate of chart center
 * @param {number} startRadius - Inner radius of the segment
 * @param {number} endRadius - Outer radius of the segment
 * @param {number} startAngle - Starting angle in radians
 * @param {number} endAngle - Ending angle in radians
 * @param {string} color - Fill color for the segment
 */
function drawSegment(
  ctx,
  centerX,
  centerY,
  startRadius,
  endRadius,
  startAngle,
  endAngle,
  color
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  // Start at inner radius, start angle
  ctx.moveTo(
    centerX + startRadius * Math.cos(startAngle),
    centerY + startRadius * Math.sin(startAngle)
  );
  // Draw outer arc
  ctx.arc(centerX, centerY, endRadius, startAngle, endAngle);
  // Line to inner radius at end angle
  ctx.lineTo(
    centerX + startRadius * Math.cos(endAngle),
    centerY + startRadius * Math.sin(endAngle)
  );
  // Draw inner arc back (counter-clockwise)
  ctx.arc(centerX, centerY, startRadius, endAngle, startAngle, true);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draws a radial gap line to separate category slices.
 * Uses canvas composite operation "destination-out" to cut through existing drawings.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {number} centerX - X coordinate of chart center
 * @param {number} centerY - Y coordinate of chart center
 * @param {number} angle - Angle of the gap line in radians
 * @param {number} width - Width of the gap
 * @param {number} length - Length of the gap (extends from center outward)
 */
function drawGap(ctx, centerX, centerY, angle, width, length) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  // "destination-out" removes existing pixels where the rectangle is drawn
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillRect(-width / 2, 0, width, length);
  ctx.restore();
}

/**
 * Calculates geometry for an average indicator with protruding circular ends.
 *
 * The average indicator is a pill-shaped marker that shows where the average
 * value falls within a ring. It consists of:
 * - Two circular end caps that protrude beyond the ring edges
 * - A connecting arc section
 *
 * Mathematical approach:
 * 1. Calculate base ring position from layer index
 * 2. Add thickness increase (20%) for visual prominence
 * 3. Calculate protrusion distance and angular extent using arcsin
 * 4. Return geometry data for rendering
 *
 * @param {number} centerX - X coordinate of chart center
 * @param {number} centerY - Y coordinate of chart center
 * @param {number} layerIndex - Which radial layer the indicator sits on
 * @param {number} startAngle - Start angle of the category slice in radians
 * @param {number} endAngle - End angle of the category slice in radians
 * @param {number} layerThickness - Thickness of one layer in pixels
 * @returns {Object} Geometry data containing:
 *   - startCircle: {x, y, radius} for the start cap
 *   - endCircle: {x, y, radius} for the end cap
 *   - mainShape: Arc geometry for the main body
 *   - protrusions: Extended arc geometry including protrusions
 *   - strokeWidth: Width for outline strokes
 */
function drawAverageLayer(
  centerX,
  centerY,
  layerIndex,
  startAngle,
  endAngle,
  layerThickness
) {
  // Calculate base ring boundaries
  const baseStartRadius = layerIndex * layerThickness;
  const baseEndRadius = baseStartRadius + layerThickness;
  const midRadius = (baseStartRadius + baseEndRadius) / 2;

  // Calculate protrusion geometry
  // The circular end caps extend 10 scaled units beyond the slice boundaries
  const protrusion = 10 * scale;
  // Use arcsin to convert linear protrusion to angular measure at midRadius
  const protrusionAngle = Math.asin(protrusion / midRadius);

  // Position indicator at center of the slice, with protrusions extending beyond
  const midAngle = (startAngle + endAngle) / 2;
  const newStartAngle = midAngle - protrusionAngle;
  const newEndAngle = midAngle + protrusionAngle;

  // Expand thickness by 20% for visual prominence
  const thicknessIncrease = layerThickness * 1.2;
  const startRadius = baseStartRadius - thicknessIncrease / 2;
  const endRadius = baseEndRadius + thicknessIncrease / 2;

  // Stroke width scales with overall scale factor
  const strokeWidth = 7 * scale;
  // Circle radius fills the expanded ring thickness
  const circleRadius = (endRadius - startRadius) / 2;

  // Calculate center positions for the circular end caps
  const startCircleX = centerX + midRadius * Math.cos(newStartAngle);
  const startCircleY = centerY + midRadius * Math.sin(newStartAngle);
  const endCircleX = centerX + midRadius * Math.cos(newEndAngle);
  const endCircleY = centerY + midRadius * Math.sin(newEndAngle);

  return {
    startCircle: { x: startCircleX, y: startCircleY, radius: circleRadius },
    endCircle: { x: endCircleX, y: endCircleY, radius: circleRadius },
    mainShape: {
      startRadius,
      endRadius,
      // Clamp to slice boundaries for main shape
      startAngle: Math.max(startAngle, newStartAngle),
      endAngle: Math.min(endAngle, newEndAngle),
    },
    protrusions: {
      startRadius: startRadius,
      endRadius: endRadius,
      startAngle: newStartAngle,
      endAngle: newEndAngle,
    },
    strokeWidth,
  };
}

// =============================================================================
// MAIN CHART RENDERING
// =============================================================================

/**
 * Main chart rendering function. Draws the complete radial chart including:
 * - Background rings for all 6 categories × 4 tiers
 * - Benchmark overlays (if enabled)
 * - Score fills with blue gradient
 * - Average indicators (if enabled)
 * - Radial gap lines between categories
 * - Numeric value labels (if enabled)
 * - SVG overlay with category labels
 *
 * Rendering order is important:
 * 1. Background rings (gray)
 * 2. Benchmark fills (orange) - drawn under scores
 * 3. Score fills (blue gradient) - drawn over benchmarks
 * 4. Average indicators (yellow with outline)
 * 5. Gap lines (cut through everything)
 * 6. Value labels (on top)
 * 7. SVG overlay (topmost layer)
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {number} canvasWidth - Width of the canvas in pixels
 * @param {number} canvasHeight - Height of the canvas in pixels
 * @param {number[]} scores - Array of 6 score values (0-4 each)
 * @param {number[]} benchmarks - Array of 6 benchmark values (0-4 each)
 * @param {number[]} averages - Array of 6 average values (0-4 each)
 */
async function drawChart(
  ctx,
  canvasWidth,
  canvasHeight,
  scores,
  benchmarks,
  averages
) {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  // Maximum radius is 80% of half the canvas width
  const maxRadius = (canvasWidth / 2) * 0.8;
  // Calculate pixel thickness per layer
  const layerThickness = maxRadius / totalLayers;

  // Clear canvas for fresh render
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Each of the 6 categories gets 1/6 of the circle (60 degrees)
  const sliceAngle = (Math.PI * 2) / 6;
  // Rotate chart so first category starts at top (-90 degrees)
  const rotationAngle = -Math.PI / 2;

  // Collect average indicator geometry for batch rendering later
  const averageIndicators = [];

  // ---------------------------------------------------------------------
  // PASS 1: Draw rings, benchmarks, scores for each category
  // ---------------------------------------------------------------------
  for (let category = 0; category < 6; category++) {
    const startAngle = category * sliceAngle + rotationAngle;
    const endAngle = (category + 1) * sliceAngle + rotationAngle;

    // Draw 4 tiers (rings) for this category
    for (let i = 0; i < 4; i++) {
      // Calculate ring boundaries accounting for gaps between rings
      const startRadius =
        (centerHole + i * (ringThickness + gapThickness)) * layerThickness;
      const endRadius = startRadius + ringThickness * layerThickness;

      // Draw background ring (gray)
      drawSegment(
        ctx,
        centerX,
        centerY,
        startRadius,
        endRadius,
        startAngle,
        endAngle,
        colors[i]
      );

      // Draw benchmark fill if enabled
      if (showBenchmark) {
        const benchmark = benchmarks[category];
        // Calculate how many sub-layers to fill (each ring has 10 sub-layers)
        // Formula: (benchmark * 10) gives total filled layers, subtract (i * 10) for previous rings
        const benchmarkLayersFilled = Math.max(
          0,
          Math.min(10, Math.floor(benchmark * 10) - i * 10)
        );
        if (benchmarkLayersFilled > 0) {
          const filledEndRadius =
            startRadius +
            (endRadius - startRadius) * (benchmarkLayersFilled / 10);
          drawSegment(
            ctx,
            centerX,
            centerY,
            startRadius,
            filledEndRadius,
            startAngle,
            endAngle,
            benchmarkColor
          );
        }
      }

      // Draw score fill (always visible, draws over benchmark)
      const score = scores[category];
      const scoreLayersFilled = Math.max(
        0,
        Math.min(10, Math.floor(score * 10) - i * 10)
      );
      if (scoreLayersFilled > 0) {
        const filledEndRadius =
          startRadius + (endRadius - startRadius) * (scoreLayersFilled / 10);
        drawSegment(
          ctx,
          centerX,
          centerY,
          startRadius,
          filledEndRadius,
          startAngle,
          endAngle,
          blueColors[i]
        );
      }
    }

    // Calculate average indicator geometry if enabled
    if (showAverage) {
      const average = averages[category];
      // Convert average value (0-4) to layer index (0-39)
      const averageLayer = Math.floor(average * 10) - 1;
      if (averageLayer >= 0) {
        // Determine which tier (0-3) and position within tier (0-9)
        const tierIndex = Math.floor(averageLayer / 10);
        const layerWithinTier = averageLayer % 10;
        const indicatorData = drawAverageLayer(
          centerX,
          centerY,
          // Calculate actual layer index including center hole and gaps
          centerHole +
            tierIndex * (ringThickness + gapThickness) +
            layerWithinTier,
          startAngle,
          endAngle,
          layerThickness
        );
        averageIndicators.push(indicatorData);
      }
    }
  }

  // ---------------------------------------------------------------------
  // PASS 2: Draw all average indicators
  // ---------------------------------------------------------------------
  if (showAverage) {
    averageIndicators.forEach((indicator) => {
      /**
       * Helper to draw a filled and stroked circle for indicator end caps.
       * @param {number} x - Center X
       * @param {number} y - Center Y
       * @param {number} radius - Circle radius
       */
      function drawFullCircle(x, y, radius) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = averageColor;
        ctx.fill();
        ctx.strokeStyle = averageStrokeColor;
        ctx.lineWidth = indicator.strokeWidth;
        ctx.stroke();
      }

      // Draw circular end caps
      drawFullCircle(
        indicator.startCircle.x,
        indicator.startCircle.y,
        indicator.startCircle.radius
      );
      drawFullCircle(
        indicator.endCircle.x,
        indicator.endCircle.y,
        indicator.endCircle.radius
      );

      // Draw protrusion arc (extends beyond slice boundaries)
      ctx.fillStyle = averageColor;
      ctx.beginPath();
      ctx.arc(
        centerX,
        centerY,
        indicator.protrusions.endRadius,
        indicator.protrusions.startAngle,
        indicator.protrusions.endAngle
      );
      ctx.arc(
        centerX,
        centerY,
        indicator.protrusions.startRadius,
        indicator.protrusions.endAngle,
        indicator.protrusions.startAngle,
        true
      );
      ctx.closePath();
      ctx.fill();

      // Draw main arc body (clipped to slice boundaries)
      ctx.beginPath();
      ctx.arc(
        centerX,
        centerY,
        indicator.mainShape.endRadius,
        indicator.mainShape.startAngle,
        indicator.mainShape.endAngle
      );
      ctx.arc(
        centerX,
        centerY,
        indicator.mainShape.startRadius,
        indicator.mainShape.endAngle,
        indicator.mainShape.startAngle,
        true
      );
      ctx.closePath();
      ctx.fill();

      // Draw outline strokes on outer and inner arcs
      ctx.strokeStyle = averageStrokeColor;
      ctx.lineWidth = indicator.strokeWidth;
      // Outer arc stroke
      ctx.beginPath();
      ctx.arc(
        centerX,
        centerY,
        indicator.protrusions.endRadius,
        indicator.protrusions.startAngle,
        indicator.protrusions.endAngle
      );
      ctx.stroke();
      // Inner arc stroke
      ctx.beginPath();
      ctx.arc(
        centerX,
        centerY,
        indicator.protrusions.startRadius,
        indicator.protrusions.endAngle,
        indicator.protrusions.startAngle,
        true
      );
      ctx.stroke();
    });
  }

  // ---------------------------------------------------------------------
  // PASS 3: Draw radial gaps between category slices
  // ---------------------------------------------------------------------
  // Gaps are drawn last with "destination-out" to cut through all previous layers
  for (let i = 0; i < 6; i++) {
    // Calculate gap angle (offset by 90 degrees from slice boundaries)
    const angle = i * sliceAngle + rotationAngle - Math.PI / 2;
    drawGap(
      ctx,
      centerX,
      centerY,
      angle,
      sliceGapThickness * layerThickness,
      maxRadius + 10 * layerThickness // Extend slightly beyond chart edge
    );
  }

  // ---------------------------------------------------------------------
  // PASS 4: Draw numeric value labels
  // ---------------------------------------------------------------------
  if (showValues) {
    // Position labels in the gap between 3rd and 4th rings
    const thirdRingOuter = (centerHole + 3 * (ringThickness + gapThickness)) * layerThickness;
    const fourthRingInner = (centerHole + 3 * (ringThickness + gapThickness) + gapThickness) * layerThickness;
    let gapCenterRadius = (thirdRingOuter + fourthRingInner) / 2;
    // Apply user-configurable distance percentage
    gapCenterRadius = gapCenterRadius * (valueDistancePercent / 100);

    ctx.font = `bold ${valueFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let category = 0; category < 6; category++) {
      // Calculate label position with user-configurable angle offset
      const angle = category * sliceAngle + rotationAngle + (valueAngleOffset * Math.PI / 180);
      const x = centerX + gapCenterRadius * Math.cos(angle);
      const y = centerY + gapCenterRadius * Math.sin(angle);
      const value = scores[category].toFixed(1);

      // Draw text with black outline for readability on any background
      ctx.strokeStyle = 'black';
      ctx.lineWidth = Math.max(2, valueFontSize / 8);
      ctx.strokeText(value, x, y);
      // Draw white fill on top
      ctx.fillStyle = 'white';
      ctx.fillText(value, x, y);
    }
  }

  // ---------------------------------------------------------------------
  // PASS 5: Load and overlay SVG with category labels
  // ---------------------------------------------------------------------
  try {
    const svgImage = await loadSVG("roundletters.svg");

    // Scale SVG to fit chart dimensions
    const newSvgHeight = canvasHeight * 0.88;
    const newSvgWidth = canvasWidth * 1.0;

    // Center SVG with vertical offset adjustment
    const svgX = (canvasWidth - newSvgWidth) / 2;
    const svgY = (canvasHeight - newSvgHeight) / 2 + svgVerticalOffset;

    ctx.drawImage(svgImage, svgX, svgY, newSvgWidth, newSvgHeight);
  } catch (error) {
    console.error("Error loading SVG:", error);
  }
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

/**
 * Dynamically creates input fields for scores, benchmarks, and averages.
 * Creates 6 number inputs (one per category) in each of 3 sections.
 * Each input triggers chart redraw on change.
 */
function createInputs() {
  const sections = ["scoreInputs", "benchmarkInputs", "averageInputs"];
  sections.forEach((sectionId) => {
    const container = document.getElementById(sectionId);
    for (let i = 0; i < 6; i++) {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "4";
      input.step = "0.1";
      input.value = "0";
      input.placeholder = `${i + 1}`;
      input.addEventListener("input", updateChart);
      container.appendChild(input);
    }
  });
}

/**
 * Retrieves and validates input values from a section.
 * Clamps all values to valid range [0, 4] and handles NaN.
 *
 * @param {string} sectionId - ID of the input container element
 * @returns {number[]} Array of 6 validated numeric values
 */
function getValues(sectionId) {
  return Array.from(document.querySelectorAll(`#${sectionId} input`)).map(
    (input) => {
      let value = parseFloat(input.value);
      return isNaN(value) ? 0 : Math.max(0, Math.min(4, value));
    }
  );
}

/**
 * Fetches current input values and redraws the chart.
 * Called whenever user input changes.
 */
async function updateChart() {
  const scores = getValues("scoreInputs");
  const benchmarks = getValues("benchmarkInputs");
  const averages = getValues("averageInputs");
  await drawChart(ctx, canvasSize, canvasSize, scores, benchmarks, averages);
}

// =============================================================================
// VISIBILITY TOGGLES
// =============================================================================

/**
 * Toggles visibility of chart elements and triggers redraw.
 *
 * @param {string} elementId - ID of the toggle button clicked
 */
function toggleVisibility(elementId) {
  if (elementId === "toggleBenchmark") {
    showBenchmark = !showBenchmark;
  } else if (elementId === "toggleAverage") {
    showAverage = !showAverage;
  } else if (elementId === "toggleValues") {
    showValues = !showValues;
  }
  updateChart();
}

/**
 * Adjusts the vertical position of the SVG overlay.
 *
 * @param {number} offset - Vertical offset in pixels
 */
function adjustVerticalPosition(offset) {
  svgVerticalOffset = offset;
  updateChart();
}

// =============================================================================
// EXPORT FUNCTIONALITY
// =============================================================================

/**
 * Exports the chart as three PNG variants:
 * 1. Scores only
 * 2. Scores + Benchmark
 * 3. Scores + Average
 *
 * Each export is named based on user input filename.
 */
async function exportAsPNG() {
  const fileName =
    document.getElementById("fileNameInput").value || "radial-chart";

  // Export scores only
  await exportScenario(fileName, false, false);

  // Export scores + benchmark
  await exportScenario(`${fileName}_Benchmark`, true, false);

  // Export scores + average
  await exportScenario(`${fileName}_Average`, false, true);
}

/**
 * Exports a single chart scenario as a high-resolution PNG.
 *
 * Creates a temporary canvas at 2x the normal resolution for crisp exports.
 * Temporarily modifies visibility flags to create the specific variant,
 * then restores original settings.
 *
 * @param {string} fileName - Name for the downloaded file (without extension)
 * @param {boolean} includeBenchmark - Whether to show benchmark in this export
 * @param {boolean} includeAverage - Whether to show average in this export
 */
async function exportScenario(fileName, includeBenchmark, includeAverage) {
  // Create temporary high-resolution canvas for export
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  tempCanvas.width = canvasSize * exportScale;
  tempCanvas.height = canvasSize * exportScale;

  // Get current input values
  const scores = getValues("scoreInputs");
  const benchmarks = getValues("benchmarkInputs");
  const averages = getValues("averageInputs");

  // Save current visibility settings
  const originalBenchmarkVisibility = showBenchmark;
  const originalAverageVisibility = showAverage;

  // Apply export-specific visibility
  showBenchmark = includeBenchmark;
  showAverage = includeAverage;

  // Render chart at export resolution
  await drawChart(
    tempCtx,
    tempCanvas.width,
    tempCanvas.height,
    scores,
    benchmarks,
    averages
  );

  // Restore original visibility settings
  showBenchmark = originalBenchmarkVisibility;
  showAverage = originalAverageVisibility;

  // Trigger download
  const dataURL = tempCanvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = `${fileName}.png`;
  link.href = dataURL;
  link.click();
}

// =============================================================================
// VALUE LABEL CONTROLS
// =============================================================================

/**
 * Sets up event listeners for value label customization controls.
 * Handles angle offset, font size, and distance percentage inputs.
 */
function setupValueControls() {
  const angleInput = document.getElementById('valueAngleOffset');
  const fontSizeInput = document.getElementById('valueFontSize');
  const distanceInput = document.getElementById('valueDistance');

  // Angle offset control - rotates all value labels around the chart center
  angleInput.addEventListener('input', () => {
    valueAngleOffset = parseFloat(angleInput.value) || 0;
    updateChart();
  });

  // Font size control - adjusts text size of value labels
  fontSizeInput.addEventListener('input', () => {
    valueFontSize = parseFloat(fontSizeInput.value) || 60;
    updateChart();
  });

  // Distance control - moves labels closer to or further from center
  distanceInput.addEventListener('input', () => {
    valueDistancePercent = parseFloat(distanceInput.value) || 100;
    updateChart();
  });
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the application when DOM is fully loaded.
 * Sets up inputs, renders initial chart, and attaches event listeners.
 */
window.addEventListener('DOMContentLoaded', () => {
  // Create dynamic input fields
  createInputs();

  // Render initial chart with default values
  updateChart();

  // Set up value label controls
  setupValueControls();

  // Attach toggle button event listeners
  document.getElementById("toggleBenchmark").addEventListener("click", () => {
    toggleVisibility("toggleBenchmark");
  });

  document.getElementById("toggleAverage").addEventListener("click", () => {
    toggleVisibility("toggleAverage");
  });

  document.getElementById("toggleValues").addEventListener("click", () => {
    toggleVisibility("toggleValues");
  });

  // Attach export button event listener
  document.getElementById("exportPNG").addEventListener("click", exportAsPNG);
});
