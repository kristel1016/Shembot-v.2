function boxArea(box) {
  return Math.max(0, box[2]) * Math.max(0, box[3]);
}

function hasPoseEvidence(detection) {
  return Boolean(detection.verifiedByPose || detection.poseHits > 0);
}

/**
 * Detect one person represented by differently cropped boxes from full-frame,
 * tiled, or pose-assisted scans. The conservative alignment checks avoid
 * merging ordinary side-by-side people.
 */
export function looksLikeSamePersonAcrossScales(first, second) {
  const firstBox = first.bbox;
  const secondBox = second.bbox;
  if (!firstBox || !secondBox) return false;

  const firstHasPose = hasPoseEvidence(first);
  const secondHasPose = hasPoseEvidence(second);
  // Two separately pose-supported boxes are evidence for two actual people.
  if (firstHasPose && secondHasPose) return false;

  const crossScan =
    typeof first.fromFullScan === "boolean" &&
    typeof second.fromFullScan === "boolean" &&
    first.fromFullScan !== second.fromFullScan;
  if (!crossScan && firstHasPose === secondHasPose) return false;

  const horizontalIntersection = Math.max(
    0,
    Math.min(firstBox[0] + firstBox[2], secondBox[0] + secondBox[2]) -
      Math.max(firstBox[0], secondBox[0]),
  );
  const verticalIntersection = Math.max(
    0,
    Math.min(firstBox[1] + firstBox[3], secondBox[1] + secondBox[3]) -
      Math.max(firstBox[1], secondBox[1]),
  );
  const smallerWidth = Math.max(1, Math.min(firstBox[2], secondBox[2]));
  const smallerHeight = Math.max(1, Math.min(firstBox[3], secondBox[3]));
  const horizontalOverlap = horizontalIntersection / smallerWidth;
  const verticalOverlap = verticalIntersection / smallerHeight;
  const firstCenterX = firstBox[0] + firstBox[2] / 2;
  const secondCenterX = secondBox[0] + secondBox[2] / 2;
  const centerXDistance = Math.abs(firstCenterX - secondCenterX);
  const verticalTop = Math.min(firstBox[1], secondBox[1]);
  const verticalBottom = Math.max(
    firstBox[1] + firstBox[3],
    secondBox[1] + secondBox[3],
  );
  const maximumHeight = Math.max(firstBox[3], secondBox[3], 1);
  const areaRatio = Math.max(boxArea(firstBox), boxArea(secondBox)) /
    Math.max(1, Math.min(boxArea(firstBox), boxArea(secondBox)));

  return (
    horizontalOverlap >= 0.72 &&
    verticalOverlap >= 0.22 &&
    centerXDistance <= smallerWidth * 0.4 &&
    (verticalBottom - verticalTop) <= maximumHeight * 1.8 &&
    areaRatio <= 3.5
  );
}

