#!/bin/bash

# Integration Test Runner with Progress Tracking
# This script runs integration tests and provides detailed progress reporting

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results directory
RESULTS_DIR="test-results/integration"
REPORT_FILE="$RESULTS_DIR/test-progress.txt"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Integration Test Runner${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Create results directory if it doesn't exist
mkdir -p "$RESULTS_DIR"

# Record start time
START_TIME=$(date +%s)
echo "Started at: $(date)" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo -e "${YELLOW}Running integration tests...${NC}"
echo ""

# Run integration tests and capture output
if npm run test:integration 2>&1 | tee "$RESULTS_DIR/test-output.log"; then
    TEST_EXIT_CODE=0
else
    TEST_EXIT_CODE=$?
fi

# Record end time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Parse junit.xml for results
if [ -f "$RESULTS_DIR/junit.xml" ]; then
    # Extract test statistics
    TOTAL_TESTS=$(grep -oP 'tests="\K[0-9]+' "$RESULTS_DIR/junit.xml" | head -1)
    FAILURES=$(grep -oP 'failures="\K[0-9]+' "$RESULTS_DIR/junit.xml" | head -1)

    PASSING=$((TOTAL_TESTS - FAILURES))
    PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSING / $TOTAL_TESTS) * 100}")

    echo "" | tee -a "$REPORT_FILE"
    echo "========================================" | tee -a "$REPORT_FILE"
    echo "         TEST RESULTS SUMMARY" | tee -a "$REPORT_FILE"
    echo "========================================" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    echo "Total Tests:    $TOTAL_TESTS" | tee -a "$REPORT_FILE"
    echo "Passing:        $PASSING" | tee -a "$REPORT_FILE"
    echo "Failing:        $FAILURES" | tee -a "$REPORT_FILE"
    echo "Pass Rate:      $PASS_RATE%" | tee -a "$REPORT_FILE"
    echo "Duration:       ${DURATION}s" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"

    # Progress tracking
    BASELINE_PASSING=156
    IMPROVEMENT=$((PASSING - BASELINE_PASSING))

    echo "Progress: +$IMPROVEMENT tests from baseline" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    echo "Report saved to: $REPORT_FILE"
    echo "HTML report: $RESULTS_DIR/integration-report.html"
    echo ""

    if [ "$FAILURES" -eq 0 ]; then
        echo -e "${GREEN}✅ ALL TESTS PASSING!${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  $FAILURES tests still failing${NC}"
        exit $TEST_EXIT_CODE
    fi
else
    echo -e "${RED}Error: Could not find junit.xml results file${NC}"
    exit 1
fi
