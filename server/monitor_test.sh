#!/bin/bash
# Phase 1 Test Monitoring Script
echo "🔍 Monitoring Phase 1 Test Trade..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
    echo "=== $(date) ==="
    
    # Check system health
    echo "📊 System Status:"
    curl -s http://localhost:5002/api/position-management/monitor-status | python3 -m json.tool || echo "API call failed"
    echo ""
    
    # Check for any stuck trades
    echo "📋 Current Positions:"
    curl -s http://localhost:5002/api/position-management/stuck-trades | python3 -m json.tool || echo "API call failed"
    echo ""
    
    echo "Waiting 30 seconds..."
    sleep 30
    echo ""
done