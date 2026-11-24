function boxArea(box) {
  return Math.max(0, box[2]) * Math.max(0, box[3]);
}

function hasPoseEvidence(detection) {
  return Boolean(detection.verifiedByPose || detection.poseHits > 0);
}

export function haveDistinctPoseIdentities(first, second) {
  return (
    Number.isInteger(first.poseId) &&
    Number.isInteger(second.poseId) &&
    first.poseId !== second.poseId
  );
}

export function areOppositeSplitPairMembers(first, second) {
  return (
    typeof first.splitPairId === "string" &&
    first.splitPairId === second.splitPairId &&
    (first.splitSide === "left" || first.splitSide === "right") &&
    (second.splitSide === "left" || second.splitSide === "right") &&
    first.splitSide !== second.splitSide
  );
}

/**
 * Identify two boxes that describe different visible parts of one person.
 * This is intentionally image-only post-processing: it requires strong
 * horizontal alignment, so ordinary side-by-side people remain separate.
 */
export function areAlignedBodyPartDetections(first, second) {
  const firstBox = first?.bbox;
  const secondBox = second?.bbox;
  if (!firstBox || !secondBox || areOppositeSplitPairMembers(first, second)) {
    return false;
  }

  const firstArea = boxArea(firstBox);
  const secondArea = boxArea(secondBox);
  const areaRatio = Math.max(firstArea, secondArea) /
    Math.max(1, Math.min(firstArea, secondArea));
  if (areaRatio > 5.5) return false;

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
  const independentlyPosedPeople =
    first.verifiedByPose &&
    second.verifiedByPose &&
    haveDistinctPoseIdentities(first, second);
  if (independentlyPosedPeople && verticalIntersection === 0) return false;
  const smallerWidth = Math.max(1, Math.min(firstBox[2], secondBox[2]));
  const smallerHeight = Math.max(1, Math.min(firstBox[3], secondBox[3]));
  const horizontalOverlap = horizontalIntersection / smallerWidth;
  const verticalOverlap = verticalIntersection / smallerHeight;
  const firstCenterX = firstBox[0] + firstBox[2] / 2;
  const secondCenterX = secondBox[0] + secondBox[2] / 2;
  const firstCenterY = firstBox[1] + firstBox[3] / 2;
  const secondCenterY = secondBox[1] + secondBox[3] / 2;
  const centerXDistance = Math.abs(firstCenterX - secondCenterX);
  const centerDistance = Math.hypot(
    firstCenterX - secondCenterX,
    firstCenterY - secondCenterY,
  );
  const smallerDiagonal = Math.max(
    1,
    Math.min(
      Math.hypot(firstBox[2], firstBox[3]),
      Math.hypot(secondBox[2], secondBox[3]),
    ),
  );
  const intersectionArea = horizontalIntersection * verticalIntersection;
  const containment = intersectionArea / Math.max(1, Math.min(firstArea, secondArea));

  const nestedPart =
    containment >= 0.72 &&
    centerXDistance <= smallerWidth * 0.55 &&
    centerDistance <= smallerDiagonal * 0.7;
  if (nestedPart) return true;

  const firstBottom = firstBox[1] + firstBox[3];
  const secondBottom = secondBox[1] + secondBox[3];
  const verticalGap = Math.max(
    0,
    Math.max(firstBox[1], secondBox[1]) - Math.min(firstBottom, secondBottom),
  );
  const verticalUnion = Math.max(firstBottom, secondBottom) -
    Math.min(firstBox[1], secondBox[1]);
  const maximumHeight = Math.max(firstBox[3], secondBox[3], 1);
  const alignedFragments =
    horizontalOverlap >= 0.68 &&
    centerXDistance <= smallerWidth * 0.48 &&
    verticalGap <= smallerHeight * 0.22 &&
    verticalUnion <= maximumHeight * 1.9;
  const overlappingSlices =
    horizontalOverlap >= 0.72 &&
    verticalOverlap >= 0.22 &&
    centerXDistance <= smallerWidth * 0.5 &&
    verticalUnion <= maximumHeight * 1.8;
  return alignedFragments || overlappingSlices;
}

function intersectionOverArea(inner, outer) {
  const left = Math.max(inner[0], outer[0]);
  const top = Math.max(inner[1], outer[1]);
  const right = Math.min(inner[0] + inner[2], outer[0] + outer[2]);
  const bottom = Math.min(inner[1] + inner[3], outer[1] + outer[3]);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  return intersection / Math.max(1, boxArea(inner));
}

/**
 * Select two full-height, horizontally distinct people recovered by rescanning
 * the left and right portions of one broad detector box. Requiring opposite
 * scan sides, strong parent containment, and separated centers avoids turning
 * two partial boxes for one person into a false pair.
 */
export function selectDistinctSplitPair(parent, detections) {
  const parentBox = parent?.bbox;
  if (!parentBox || parentBox[2] / Math.max(1, parentBox[3]) < 0.4) return [];

  const parentLeft = parentBox[0];
  const parentTop = parentBox[1];
  const parentWidth = parentBox[2];
  const parentHeight = parentBox[3];
  const parentMidpoint = parentLeft + parentWidth / 2;
  const eligible = detections.filter((detection) => {
    const box = detection?.bbox;
    if (!box || detection.score < 0.24) return false;
    const centerX = box[0] + box[2] / 2;
    const centerY = box[1] + box[3] / 2;
    return (
      (detection.splitSide === "left" || detection.splitSide === "right") &&
      intersectionOverArea(box, parentBox) >= 0.72 &&
      box[3] >= parentHeight * 0.5 &&
      box[2] <= parentWidth * 0.76 &&
      box[3] / Math.max(1, box[2]) >= 0.9 &&
      centerX >= parentLeft - parentWidth * 0.04 &&
      centerX <= parentLeft + parentWidth * 1.04 &&
      centerY >= parentTop + parentHeight * 0.25 &&
      centerY <= parentTop + parentHeight * 0.78
    );
  });

  let bestPair = [];
  let bestScore = -Infinity;
  for (const left of eligible.filter((item) => item.splitSide === "left")) {
    const leftCenterX = left.bbox[0] + left.bbox[2] / 2;
    if (leftCenterX > parentMidpoint + parentWidth * 0.08) continue;
    for (const right of eligible.filter((item) => item.splitSide === "right")) {
      const rightCenterX = right.bbox[0] + right.bbox[2] / 2;
      if (rightCenterX < parentMidpoint - parentWidth * 0.08) continue;
      const separation = rightCenterX - leftCenterX;
      if (separation < parentWidth * 0.22) continue;

      const horizontalIntersection = Math.max(
        0,
        Math.min(
          left.bbox[0] + left.bbox[2],
          right.bbox[0] + right.bbox[2],
        ) - Math.max(left.bbox[0], right.bbox[0]),
      );
      const smallerWidth = Math.max(
        1,
        Math.min(left.bbox[2], right.bbox[2]),
      );
      // Two crops can return the same person with slightly shifted boxes.
      // Real side-by-side people have distinct horizontal centers and do not
      // overlap most of the narrower box.
      if (
        separation < smallerWidth * 0.65 ||
        horizontalIntersection / smallerWidth > 0.48
      ) continue;

      const top = Math.max(left.bbox[1], right.bbox[1]);
      const bottom = Math.min(
        left.bbox[1] + left.bbox[3],
        right.bbox[1] + right.bbox[3],
      );
      const verticalOverlap = Math.max(0, bottom - top) /
        Math.max(1, Math.min(left.bbox[3], right.bbox[3]));
      if (verticalOverlap < 0.48) continue;
      const smallerHeight = Math.max(
        1,
        Math.min(left.bbox[3], right.bbox[3]),
      );
      const heightRatio = Math.max(left.bbox[3], right.bbox[3]) /
        smallerHeight;
      const topDifference = Math.abs(left.bbox[1] - right.bbox[1]);
      if (heightRatio > 1.55 || topDifference > smallerHeight * 0.35) continue;

      const score = left.score + right.score + separation / parentWidth;
      if (score > bestScore) {
        bestScore = score;
        bestPair = [left, right];
      }
    }
  }

  return bestPair;
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
    (
      typeof first.scanId === "string" &&
      typeof second.scanId === "string" &&
      first.scanId !== second.scanId
    ) || (
      typeof first.fromFullScan === "boolean" &&
      typeof second.fromFullScan === "boolean" &&
      first.fromFullScan !== second.fromFullScan
    );
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
  const intersectionArea = horizontalIntersection * verticalIntersection;
  const firstArea = boxArea(firstBox);
  const secondArea = boxArea(secondBox);
  const unionArea = firstArea + secondArea - intersectionArea;
  const overlap = unionArea > 0 ? intersectionArea / unionArea : 0;
  const firstCenterX = firstBox[0] + firstBox[2] / 2;
  const secondCenterX = secondBox[0] + secondBox[2] / 2;
  const centerXDistance = Math.abs(firstCenterX - secondCenterX);
  const firstCenterY = firstBox[1] + firstBox[3] / 2;
  const secondCenterY = secondBox[1] + secondBox[3] / 2;
  const centerDistance = Math.hypot(
    firstCenterX - secondCenterX,
    firstCenterY - secondCenterY,
  );
  const smallerDiagonal = Math.max(
    1,
    Math.min(
      Math.hypot(firstBox[2], firstBox[3]),
      Math.hypot(secondBox[2], secondBox[3]),
    ),
  );
  const verticalTop = Math.min(firstBox[1], secondBox[1]);
  const verticalBottom = Math.max(
    firstBox[1] + firstBox[3],
    secondBox[1] + secondBox[3],
  );
  const maximumHeight = Math.max(firstBox[3], secondBox[3], 1);
  const areaRatio = Math.max(boxArea(firstBox), boxArea(secondBox)) /
    Math.max(1, Math.min(boxArea(firstBox), boxArea(secondBox)));

  // Repeated detections from overlapping tiles are usually nearly the same
  // size and center even when their edges move enough to defeat ordinary NMS.
  if (
    overlap >= 0.28 &&
    centerDistance <= smallerDiagonal * 0.35 &&
    areaRatio <= 2.8
  ) {
    return true;
  }

  // One tile may return a torso while another returns most of the body.
  const containment = intersectionArea / Math.max(1, Math.min(firstArea, secondArea));
  if (
    containment >= 0.58 &&
    centerDistance <= smallerDiagonal * 0.48 &&
    areaRatio <= 3.5
  ) {
    return true;
  }

  return (
    horizontalOverlap >= 0.72 &&
    verticalOverlap >= 0.22 &&
    centerXDistance <= smallerWidth * 0.4 &&
    (verticalBottom - verticalTop) <= maximumHeight * 1.8 &&
    areaRatio <= 3.5
  );
}

