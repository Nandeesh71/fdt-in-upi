"""
Feature Importance Analysis
Analyzes which features are most important for fraud detection
"""

import json
import numpy as np
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
from app.feature_engine import get_feature_names

# Set style
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (14, 8)


def plot_feature_importance_rf(model, feature_names, top_n=20):
    """Plot feature importance for Random Forest."""
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1][:top_n]
    
    plt.figure(figsize=(12, 8))
    plt.title('Random Forest - Top Feature Importances', fontsize=16, fontweight='bold')
    plt.barh(range(top_n), importances[indices], color='steelblue')
    plt.yticks(range(top_n), [feature_names[i] for i in indices])
    plt.xlabel('Importance Score', fontsize=12)
    plt.ylabel('Features', fontsize=12)
    plt.gca().invert_yaxis()
    plt.tight_layout()
    plt.savefig('models/feature_importance_rf.png', dpi=300)
    print("✓ Saved: models/feature_importance_rf.png")
    plt.close()
    
    return list(zip([feature_names[i] for i in indices], importances[indices]))


def plot_feature_importance_xgb(model, feature_names, top_n=20):
    """Plot feature importance for XGBoost."""
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1][:top_n]
    
    plt.figure(figsize=(12, 8))
    plt.title('XGBoost - Top Feature Importances', fontsize=16, fontweight='bold')
    plt.barh(range(top_n), importances[indices], color='coral')
    plt.yticks(range(top_n), [feature_names[i] for i in indices])
    plt.xlabel('Importance Score', fontsize=12)
    plt.ylabel('Features', fontsize=12)
    plt.gca().invert_yaxis()
    plt.tight_layout()
    plt.savefig('models/feature_importance_xgb.png', dpi=300)
    print("✓ Saved: models/feature_importance_xgb.png")
    plt.close()
    
    return list(zip([feature_names[i] for i in indices], importances[indices]))


def plot_feature_comparison(rf_importance, xgb_importance, feature_names, top_n=15):
    """Compare feature importance between Random Forest and XGBoost."""
    # Get common top features
    rf_dict = dict(rf_importance)
    xgb_dict = dict(xgb_importance)
    
    all_features = set(list(rf_dict.keys())[:top_n] + list(xgb_dict.keys())[:top_n])
    common_features = sorted(all_features, 
                            key=lambda x: rf_dict.get(x, 0) + xgb_dict.get(x, 0), 
                            reverse=True)[:top_n]
    
    rf_scores = [rf_dict.get(f, 0) for f in common_features]
    xgb_scores = [xgb_dict.get(f, 0) for f in common_features]
    
    x = np.arange(len(common_features))
    width = 0.35
    
    fig, ax = plt.subplots(figsize=(14, 8))
    bars1 = ax.barh(x - width/2, rf_scores, width, label='Random Forest', color='steelblue')
    bars2 = ax.barh(x + width/2, xgb_scores, width, label='XGBoost', color='coral')
    
    ax.set_xlabel('Importance Score', fontsize=12)
    ax.set_ylabel('Features', fontsize=12)
    ax.set_title('Feature Importance Comparison - RF vs XGBoost', fontsize=16, fontweight='bold')
    ax.set_yticks(x)
    ax.set_yticklabels(common_features)
    ax.legend(fontsize=11)
    ax.invert_yaxis()
    
    plt.tight_layout()
    plt.savefig('models/feature_importance_comparison.png', dpi=300)
    print("✓ Saved: models/feature_importance_comparison.png")
    plt.close()


def generate_feature_report(rf_importance, xgb_importance, feature_names):
    """Generate detailed feature importance report."""
    report = []
    report.append("="*80)
    report.append("FEATURE IMPORTANCE ANALYSIS REPORT")
    report.append("="*80)
    report.append(f"\nTotal Features: {len(feature_names)}")
    report.append("\n" + "="*80)
    
    # Random Forest
    report.append("\n\nRANDOM FOREST - TOP 15 FEATURES")
    report.append("-" * 80)
    report.append(f"{'Rank':<6} {'Feature':<30} {'Importance':<15}")
    report.append("-" * 80)
    for idx, (feat, imp) in enumerate(rf_importance[:15], 1):
        report.append(f"{idx:<6} {feat:<30} {imp:<15.6f}")
    
    # XGBoost
    report.append("\n\n" + "="*80)
    report.append("XGBOOST - TOP 15 FEATURES")
    report.append("-" * 80)
    report.append(f"{'Rank':<6} {'Feature':<30} {'Importance':<15}")
    report.append("-" * 80)
    for idx, (feat, imp) in enumerate(xgb_importance[:15], 1):
        report.append(f"{idx:<6} {feat:<30} {imp:<15.6f}")
    
    # Feature Categories
    report.append("\n\n" + "="*80)
    report.append("FEATURE IMPORTANCE BY CATEGORY")
    report.append("="*80)
    
    categories = {
        'Basic': ['amount', 'log_amount', 'is_round_amount'],
        'Temporal': ['hour_of_day', 'day_of_week', 'is_weekend', 'is_night', 'is_business_hours'],
        'Velocity': ['tx_count_1h', 'tx_count_6h', 'tx_count_24h', 'tx_count_1min', 'tx_count_5min'],
        'Behavioral': ['is_new_recipient', 'recipient_tx_count', 'is_new_device', 'device_count', 'is_p2m'],
        'Statistical': ['amount_mean', 'amount_std', 'amount_max', 'amount_deviation'],
        'Risk': ['merchant_risk_score', 'is_qr_channel', 'is_web_channel']
    }
    
    rf_dict = dict(rf_importance)
    xgb_dict = dict(xgb_importance)
    
    for category, features in categories.items():
        rf_avg = np.mean([rf_dict.get(f, 0) for f in features])
        xgb_avg = np.mean([xgb_dict.get(f, 0) for f in features])
        report.append(f"\n{category} Features:")
        report.append(f"  Random Forest Avg:  {rf_avg:.6f}")
        report.append(f"  XGBoost Avg:        {xgb_avg:.6f}")
    
    # Key Insights
    report.append("\n\n" + "="*80)
    report.append("KEY INSIGHTS")
    report.append("="*80)
    
    top_rf = [f[0] for f in rf_importance[:5]]
    top_xgb = [f[0] for f in xgb_importance[:5]]
    common_top = set(top_rf) & set(top_xgb)
    
    report.append(f"\nTop 5 Features (Random Forest): {', '.join(top_rf)}")
    report.append(f"Top 5 Features (XGBoost): {', '.join(top_xgb)}")
    report.append(f"\nFeatures in both top 5: {', '.join(common_top) if common_top else 'None'}")
    
    # Save report
    report_text = "\n".join(report)
    with open("models/feature_importance_report.txt", "w") as f:
        f.write(report_text)
    print("✓ Saved: models/feature_importance_report.txt")
    
    return report_text


def main():
    """Main feature importance analysis pipeline."""
    print("="*80)
    print("FEATURE IMPORTANCE ANALYSIS")
    print("="*80)
    
    # Load feature names
    feature_names = get_feature_names()
    print(f"\nTotal features: {len(feature_names)}")
    
    # Load models
    print("\nLoading models...")
    try:
        rf = joblib.load("models/random_forest.joblib")
        print("✓ Loaded Random Forest")
    except Exception as e:
        print(f"❌ Could not load Random Forest: {e}")
        rf = None
    
    try:
        xgb_model = joblib.load("models/xgboost.joblib")
        print("✓ Loaded XGBoost")
    except Exception as e:
        print(f"❌ Could not load XGBoost: {e}")
        xgb_model = None
    
    if not rf and not xgb_model:
        print("\n❌ No models found! Run 'python train_models.py' first.")
        return
    
    # Analyze feature importance
    print("\nAnalyzing feature importance...")
    
    rf_importance = None
    xgb_importance = None
    
    if rf:
        rf_importance = plot_feature_importance_rf(rf, feature_names)
    
    if xgb_model:
        xgb_importance = plot_feature_importance_xgb(xgb_model, feature_names)
    
    if rf and xgb_model:
        plot_feature_comparison(rf_importance, xgb_importance, feature_names)
    
    # Generate report
    if rf_importance and xgb_importance:
        print("\nGenerating feature importance report...")
        generate_feature_report(rf_importance, xgb_importance, feature_names)
    
    print("\n" + "="*80)
    print("FEATURE IMPORTANCE ANALYSIS COMPLETE")
    print("="*80)
    print("\nGenerated files:")
    if rf:
        print("  • models/feature_importance_rf.png")
    if xgb_model:
        print("  • models/feature_importance_xgb.png")
    if rf and xgb_model:
        print("  • models/feature_importance_comparison.png")
        print("  • models/feature_importance_report.txt")
    print("\n✓ Analysis complete!")


if __name__ == "__main__":
    main()
