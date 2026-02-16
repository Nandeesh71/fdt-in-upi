"""
Model Evaluation Script - Comprehensive analysis of trained models
Generates visualizations and detailed metrics
"""

import json
import numpy as np
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import (
    roc_curve, auc, precision_recall_curve,
    confusion_matrix, classification_report
)
from train_models import create_training_dataset
from sklearn.model_selection import train_test_split

# Set style
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (12, 8)


def plot_roc_curves(models_dict, X_test, y_test):
    """Plot ROC curves for all models."""
    plt.figure(figsize=(10, 8))
    
    for name, model_info in models_dict.items():
        model = model_info['model']
        is_supervised = model_info['supervised']
        
        if is_supervised:
            y_proba = model.predict_proba(X_test)[:, 1]
        else:
            # Isolation Forest: use anomaly scores
            y_proba = -model.decision_function(X_test)
        
        fpr, tpr, _ = roc_curve(y_test, y_proba)
        roc_auc = auc(fpr, tpr)
        
        plt.plot(fpr, tpr, lw=2, label=f'{name} (AUC = {roc_auc:.3f})')
    
    plt.plot([0, 1], [0, 1], 'k--', lw=2, label='Random')
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('False Positive Rate', fontsize=12)
    plt.ylabel('True Positive Rate', fontsize=12)
    plt.title('ROC Curves - Model Comparison', fontsize=14, fontweight='bold')
    plt.legend(loc="lower right", fontsize=10)
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('models/roc_curves.png', dpi=300)
    print("✓ Saved: models/roc_curves.png")
    plt.close()


def plot_precision_recall_curves(models_dict, X_test, y_test):
    """Plot Precision-Recall curves for all models."""
    plt.figure(figsize=(10, 8))
    
    for name, model_info in models_dict.items():
        model = model_info['model']
        is_supervised = model_info['supervised']
        
        if is_supervised:
            y_proba = model.predict_proba(X_test)[:, 1]
        else:
            y_proba = -model.decision_function(X_test)
        
        precision, recall, _ = precision_recall_curve(y_test, y_proba)
        pr_auc = auc(recall, precision)
        
        plt.plot(recall, precision, lw=2, label=f'{name} (AUC = {pr_auc:.3f})')
    
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('Recall', fontsize=12)
    plt.ylabel('Precision', fontsize=12)
    plt.title('Precision-Recall Curves - Model Comparison', fontsize=14, fontweight='bold')
    plt.legend(loc="lower left", fontsize=10)
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('models/precision_recall_curves.png', dpi=300)
    print("✓ Saved: models/precision_recall_curves.png")
    plt.close()


def plot_confusion_matrices(models_dict, X_test, y_test):
    """Plot confusion matrices for all models."""
    n_models = len(models_dict)
    fig, axes = plt.subplots(1, n_models, figsize=(6*n_models, 5))
    
    if n_models == 1:
        axes = [axes]
    
    for idx, (name, model_info) in enumerate(models_dict.items()):
        model = model_info['model']
        is_supervised = model_info['supervised']
        
        if is_supervised:
            y_pred = model.predict(X_test)
        else:
            y_pred_raw = model.predict(X_test)
            y_pred = np.where(y_pred_raw == -1, 1, 0)
        
        cm = confusion_matrix(y_test, y_pred)
        
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                   xticklabels=['Normal', 'Fraud'],
                   yticklabels=['Normal', 'Fraud'],
                   ax=axes[idx], cbar=True)
        axes[idx].set_title(f'{name}\nConfusion Matrix', fontweight='bold')
        axes[idx].set_ylabel('True Label')
        axes[idx].set_xlabel('Predicted Label')
    
    plt.tight_layout()
    plt.savefig('models/confusion_matrices.png', dpi=300)
    print("✓ Saved: models/confusion_matrices.png")
    plt.close()


def plot_score_distributions(models_dict, X_test, y_test):
    """Plot score distributions for fraud vs normal transactions."""
    n_models = len(models_dict)
    fig, axes = plt.subplots(1, n_models, figsize=(6*n_models, 5))
    
    if n_models == 1:
        axes = [axes]
    
    for idx, (name, model_info) in enumerate(models_dict.items()):
        model = model_info['model']
        is_supervised = model_info['supervised']
        
        if is_supervised:
            scores = model.predict_proba(X_test)[:, 1]
        else:
            scores = -model.decision_function(X_test)
        
        # Normalize scores to 0-1
        scores = (scores - scores.min()) / (scores.max() - scores.min() + 1e-10)
        
        fraud_scores = scores[y_test == 1]
        normal_scores = scores[y_test == 0]
        
        axes[idx].hist(normal_scores, bins=50, alpha=0.6, label='Normal', color='green')
        axes[idx].hist(fraud_scores, bins=50, alpha=0.6, label='Fraud', color='red')
        axes[idx].set_xlabel('Risk Score', fontsize=11)
        axes[idx].set_ylabel('Frequency', fontsize=11)
        axes[idx].set_title(f'{name}\nScore Distribution', fontweight='bold')
        axes[idx].legend()
        axes[idx].grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('models/score_distributions.png', dpi=300)
    print("✓ Saved: models/score_distributions.png")
    plt.close()


def generate_detailed_report(models_dict, X_test, y_test, metadata):
    """Generate detailed text report."""
    report = []
    report.append("="*80)
    report.append("UPI FRAUD DETECTION - MODEL EVALUATION REPORT")
    report.append("="*80)
    report.append(f"\nTraining Date: {metadata.get('training_date', 'N/A')}")
    report.append(f"Training Samples: {metadata.get('training_samples', 'N/A')}")
    report.append(f"Test Samples: {metadata.get('test_samples', 'N/A')}")
    report.append(f"Number of Features: {metadata.get('num_features', 'N/A')}")
    report.append(f"Fraud Rate: {metadata.get('fraud_rate', 0)*100:.2f}%")
    report.append("\n" + "="*80)
    
    for name, model_info in models_dict.items():
        model = model_info['model']
        is_supervised = model_info['supervised']
        
        report.append(f"\n\n{'='*80}")
        report.append(f"MODEL: {name.upper()}")
        report.append(f"{'='*80}")
        
        if is_supervised:
            y_pred = model.predict(X_test)
            y_proba = model.predict_proba(X_test)[:, 1]
        else:
            y_pred_raw = model.predict(X_test)
            y_pred = np.where(y_pred_raw == -1, 1, 0)
            y_proba = -model.decision_function(X_test)
        
        # Classification Report
        report.append("\nClassification Report:")
        report.append("-" * 80)
        report.append(classification_report(y_test, y_pred, target_names=['Normal', 'Fraud']))
        
        # Confusion Matrix
        cm = confusion_matrix(y_test, y_pred)
        report.append("\nConfusion Matrix:")
        report.append("-" * 80)
        report.append(f"                  Predicted Normal  Predicted Fraud")
        report.append(f"Actual Normal           {cm[0,0]:>6}          {cm[0,1]:>6}")
        report.append(f"Actual Fraud            {cm[1,0]:>6}          {cm[1,1]:>6}")
        
        # Metrics
        tn, fp, fn, tp = cm.ravel()
        accuracy = (tp + tn) / (tp + tn + fp + fn)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
        
        report.append("\nKey Metrics:")
        report.append("-" * 80)
        report.append(f"Accuracy:              {accuracy:.4f}")
        report.append(f"Precision (Fraud):     {precision:.4f}")
        report.append(f"Recall (Fraud):        {recall:.4f}")
        report.append(f"F1-Score (Fraud):      {f1:.4f}")
        report.append(f"False Positive Rate:   {fpr:.4f}")
        
        # ROC-AUC
        from sklearn.metrics import roc_auc_score
        roc_auc = roc_auc_score(y_test, y_proba)
        report.append(f"ROC-AUC Score:         {roc_auc:.4f}")
        
        # PR-AUC
        precision_curve, recall_curve, _ = precision_recall_curve(y_test, y_proba)
        pr_auc = auc(recall_curve, precision_curve)
        report.append(f"PR-AUC Score:          {pr_auc:.4f}")
    
    # Save report
    report_text = "\n".join(report)
    with open("models/evaluation_report.txt", "w") as f:
        f.write(report_text)
    print("✓ Saved: models/evaluation_report.txt")
    
    return report_text


def main():
    """Main evaluation pipeline."""
    print("="*80)
    print("MODEL EVALUATION - Loading models and generating analysis")
    print("="*80)
    
    # Load metadata
    try:
        with open("models/metadata.json", "r") as f:
            metadata = json.load(f)
        print("✓ Loaded metadata")
    except:
        print("⚠ Warning: Could not load metadata.json")
        metadata = {}
    
    # Load models
    print("\nLoading trained models...")
    models_dict = {}
    
    try:
        iforest = joblib.load("models/iforest.joblib")
        models_dict['Isolation Forest'] = {'model': iforest, 'supervised': False}
        print("✓ Loaded Isolation Forest")
    except Exception as e:
        print(f"⚠ Could not load Isolation Forest: {e}")
    
    try:
        rf = joblib.load("models/random_forest.joblib")
        models_dict['Random Forest'] = {'model': rf, 'supervised': True}
        print("✓ Loaded Random Forest")
    except Exception as e:
        print(f"⚠ Could not load Random Forest: {e}")
    
    try:
        xgb_model = joblib.load("models/xgboost.joblib")
        models_dict['XGBoost'] = {'model': xgb_model, 'supervised': True}
        print("✓ Loaded XGBoost")
    except Exception as e:
        print(f"⚠ Could not load XGBoost: {e}")
    
    if not models_dict:
        print("\n❌ No models found! Run 'python train_models.py' first.")
        return
    
    # Generate test data
    print("\nGenerating test dataset...")
    X, y, _ = create_training_dataset(n_normal=3000, n_fraud=300, use_redis=False)
    _, X_test, _, y_test = train_test_split(X, y, test_size=0.5, random_state=42, stratify=y)
    print(f"✓ Test set: {X_test.shape[0]} samples ({np.sum(y_test == 1)} fraud)")
    
    # Generate visualizations
    print("\nGenerating visualizations...")
    plot_roc_curves(models_dict, X_test, y_test)
    plot_precision_recall_curves(models_dict, X_test, y_test)
    plot_confusion_matrices(models_dict, X_test, y_test)
    plot_score_distributions(models_dict, X_test, y_test)
    
    # Generate detailed report
    print("\nGenerating detailed report...")
    report = generate_detailed_report(models_dict, X_test, y_test, metadata)
    
    print("\n" + "="*80)
    print("EVALUATION COMPLETE")
    print("="*80)
    print("\nGenerated files:")
    print("  • models/roc_curves.png")
    print("  • models/precision_recall_curves.png")
    print("  • models/confusion_matrices.png")
    print("  • models/score_distributions.png")
    print("  • models/evaluation_report.txt")
    print("\n✓ All evaluation outputs saved successfully!")


if __name__ == "__main__":
    main()
