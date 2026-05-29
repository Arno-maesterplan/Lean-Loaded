#!/bin/bash
# 🚀 Lean & Loaded — Deploy script
# Dubbelklik dit bestand om wijzigingen live te zetten

REPO="/Users/arnomaes/Documents/GitHub/Lean & Loaded"

cd "$REPO"

# Verwijder eventuele lock-bestanden
find "$REPO/.git" -name "*.lock" -delete 2>/dev/null

# Commit en push
git add -A
git commit -m "Update $(date '+%d/%m/%Y %H:%M')"
git push origin main

echo ""
echo "✅ Klaar! Lean & Loaded is live op https://arno-maesterplan.github.io/Lean-Loaded/"
echo "   Je iPhone is bijgewerkt na de volgende herlaad."
echo ""
read -p "Druk op Enter om te sluiten..."
