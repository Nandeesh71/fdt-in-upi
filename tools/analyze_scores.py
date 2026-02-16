import numpy as np
import joblib
from train_iforest import create_dataset

# Load trained model
model = joblib.load("models/iforest.joblib")

# Generate normal-like data (no anomalies)
X = create_dataset(n=5000, n_anom=0)

# Compute model scores
scores = -model.decision_function(X)

print("SCORE DISTRIBUTION:")
print("Min:", scores.min())
print("Max:", scores.max())
print("Mean:", scores.mean())
print("Std:", scores.std())
print()

# Print important percentiles
for p in [90, 95, 97, 99, 99.5]:
    print(f"P{p} =", np.percentile(scores, p))
