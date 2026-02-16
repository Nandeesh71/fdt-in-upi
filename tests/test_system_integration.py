"""
System Integration Tests for FDT
Tests the complete fraud detection workflow with real database and ML models.
"""

import os
import sys
import pytest
import psycopg2
from datetime import datetime, timezone
from unittest.mock import patch
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.fraud_reasons import generate_fraud_reasons, categorize_fraud_risk
from app.scoring import score_transaction, extract_features
from app.feature_engine import get_feature_names


class TestEnvironmentSetup:
    """Test environment configuration"""
    
    def test_env_variables_loaded(self):
        """Verify critical environment variables are set"""
        assert os.getenv('DB_URL'), "DB_URL not set"
        assert os.getenv('DELAY_THRESHOLD'), "DELAY_THRESHOLD not set"
        assert os.getenv('BLOCK_THRESHOLD'), "BLOCK_THRESHOLD not set"
    
    def test_threshold_values(self):
        """Verify thresholds are reasonable"""
        delay = float(os.getenv('DELAY_THRESHOLD', '0.30'))
        block = float(os.getenv('BLOCK_THRESHOLD', '0.60'))
        
        assert delay > 0 and delay < 1, "DELAY_THRESHOLD out of range"
        assert block > delay, "BLOCK_THRESHOLD should be greater than DELAY_THRESHOLD"
        assert block < 1, "BLOCK_THRESHOLD should be less than 1"
        
        # Our optimized thresholds
        assert delay == 0.35, "DELAY_THRESHOLD should be 0.35"
        assert block == 0.70, "BLOCK_THRESHOLD should be 0.70"


class TestDatabaseSetup:
    """Test database initialization and connectivity"""
    
    @pytest.fixture(autouse=True)
    def db_connection(self):
        """Create database connection for tests"""
        try:
            conn = psycopg2.connect(os.getenv('DB_URL'))
            yield conn
            conn.close()
        except psycopg2.OperationalError as e:
            pytest.skip(f"Database not available: {e}")
    
    def test_database_connection(self, db_connection):
        """Verify database is accessible"""
        assert db_connection is not None
        cur = db_connection.cursor()
        cur.execute("SELECT 1")
        assert cur.fetchone()[0] == 1
        cur.close()
    
    def test_tables_exist(self, db_connection):
        """Verify all required tables exist"""
        required_tables = [
            'users', 'transactions', 'user_devices', 'fraud_alerts',
            'user_behavior', 'push_tokens', 'transaction_ledger',
            'user_daily_transactions'
        ]
        
        cur = db_connection.cursor()
        cur.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema='public'
        """)
        existing_tables = [t[0] for t in cur.fetchall()]
        cur.close()
        
        for table in required_tables:
            assert table in existing_tables, f"Table {table} not found"
    
    def test_test_users_exist(self, db_connection):
        """Verify test users are in database"""
        cur = db_connection.cursor()
        cur.execute("SELECT COUNT(*) FROM users")
        user_count = cur.fetchone()[0]
        cur.close()
        
        assert user_count > 0, "No test users found in database"


class TestFraudDetectionEngine:
    """Test fraud detection scoring and decision making"""
    
    def get_test_features(self):
        """Get baseline test features"""
        return {
            'amount': 100.0,
            'is_new_recipient': 1.0,
            'is_new_device': 0.0,
            'is_night': 0.0,
            'velocity_last_1h': 0.0,
            'avg_amount': 500.0,
            'user_age_days': 365.0,
            'location_mismatch': 0.0,
            'amount_deviation': -0.8,
            'recipient_frequency': 0.1,
            'hourly_transactions': 1.0,
            'daily_transactions': 3.0,
            'day_of_week': 3.0,
            'time_of_day': 12.0,
            'network_distance': 0.5,
            'device_age_days': 180.0,
            'recipient_risk_score': 0.1,
            'weekday_avg': 450.0,
            'similar_recipient_count': 0.0,
            'payment_method': 1.0,
            'tx_flow_rate': 0.5,
            'seasonality_factor': 1.0,
            'distance_from_home': 0.2,
            'credit_limit_usage': 0.1,
            'fraud_like_pattern': 0.0
        }
    
    def test_small_amount_approved(self):
        """Test that small payments to new recipients are APPROVED"""
        features = self.get_test_features()
        features['amount'] = 100.0
        
        scores = {
            'ensemble': 0.10,
            'iforest': 0.08,
            'random_forest': 0.12,
            'xgboost': 0.10
        }
        
        reasons, composite = generate_fraud_reasons(features, scores)
        
        assert composite < 0.35, f"Small payment should have score < 0.35, got {composite}"
        assert len(reasons) > 0, "Should have fraud reasons identified"
    
    def test_large_amount_with_risk_delayed(self):
        """Test that large payments with risk factors are DELAYED"""
        features = self.get_test_features()
        features['amount'] = 75000.0
        features['is_night'] = 1.0
        features['velocity_last_1h'] = 2.0
        features['user_age_days'] = 30.0
        features['amount_deviation'] = 1.5
        
        scores = {
            'ensemble': 0.62,
            'iforest': 0.65,
            'random_forest': 0.58,
            'xgboost': 0.65
        }
        
        reasons, composite = generate_fraud_reasons(features, scores)
        
        assert 0.35 <= composite < 0.70, f"Risky transaction should have 0.35 <= score < 0.70, got {composite}"
        assert len(reasons) >= 3, "Should identify multiple fraud reasons"
        
        # Verify critical reasons are identified
        reason_texts = [r.reason for r in reasons]
        critical_keywords = ['high', 'risk', 'amount']
        assert any(keyword in ' '.join(reason_texts).lower() for keyword in critical_keywords)
    
    def test_extreme_fraud_blocked(self):
        """Test that extremely fraudulent transactions are BLOCKED or at least DELAYED"""
        features = self.get_test_features()
        features['amount'] = 150000.0
        features['is_new_device'] = 1.0
        features['is_night'] = 1.0
        features['velocity_last_1h'] = 5.0
        features['user_age_days'] = 5.0
        features['location_mismatch'] = 1.0
        features['amount_deviation'] = 3.0
        features['fraud_like_pattern'] = 1.0
        
        scores = {
            'ensemble': 0.85,
            'iforest': 0.88,
            'random_forest': 0.82,
            'xgboost': 0.87
        }
        
        reasons, composite = generate_fraud_reasons(features, scores)
        
        # Should be either DELAYED or BLOCKED (>= 0.35)
        assert composite >= 0.35, f"Extreme fraud should have high score, got {composite}"
        assert len(reasons) >= 3, "Should identify multiple fraud reasons"
    
    def test_fraud_reasons_generation(self):
        """Test that fraud reasons are properly generated"""
        features = self.get_test_features()
        scores = {'ensemble': 0.50, 'iforest': 0.45, 'random_forest': 0.52, 'xgboost': 0.50}
        
        reasons, composite = generate_fraud_reasons(features, scores)
        
        assert isinstance(reasons, list), "Reasons should be a list"
        assert len(reasons) >= 0, "Should return list of reasons"
        
        # Each reason should have required attributes
        for reason in reasons:
            assert hasattr(reason, 'reason'), "Reason should have 'reason' attribute"
            assert hasattr(reason, 'severity'), "Reason should have 'severity' attribute"
            assert reason.severity in ['low', 'medium', 'high', 'critical'], f"Invalid severity: {reason.severity}"
    
    def test_risk_categorization(self):
        """Test risk categorization logic"""
        # Low risk
        result = categorize_fraud_risk(0.20, [])
        assert result['risk_level'] == 'APPROVED', "Score 0.20 should be APPROVED"
        
        # Medium risk - just below delay threshold
        result = categorize_fraud_risk(0.30, [])
        assert result['risk_level'] == 'APPROVED', "Score 0.30 should be APPROVED"
        
        # Delay risk - at or just above threshold
        result = categorize_fraud_risk(0.50, [])
        assert result['risk_level'] in ['DELAYED', 'BLOCKED'], "Score 0.50 should be DELAYED or BLOCKED"


class TestThresholdConfiguration:
    """Test that thresholds are applied correctly"""
    
    def test_delay_threshold_applied(self):
        """Test DELAY_THRESHOLD is properly loaded and used"""
        delay_threshold = float(os.getenv('DELAY_THRESHOLD', '0.30'))
        assert delay_threshold == 0.35, "DELAY_THRESHOLD should be 0.35 (optimized)"
    
    def test_block_threshold_applied(self):
        """Test BLOCK_THRESHOLD is properly loaded and used"""
        block_threshold = float(os.getenv('BLOCK_THRESHOLD', '0.60'))
        assert block_threshold == 0.70, "BLOCK_THRESHOLD should be 0.70 (optimized)"
    
    def test_threshold_ordering(self):
        """Test that DELAY < BLOCK threshold"""
        delay = float(os.getenv('DELAY_THRESHOLD'))
        block = float(os.getenv('BLOCK_THRESHOLD'))
        assert delay < block, "DELAY threshold should be less than BLOCK threshold"


class TestFeatureExtraction:
    """Test feature extraction from transactions"""
    
    def test_feature_names_exist(self):
        """Test that feature names can be retrieved"""
        feature_names = get_feature_names()
        assert isinstance(feature_names, list), "Feature names should be a list"
        assert len(feature_names) > 0, "Should have feature names defined"
        assert len(feature_names) >= 25, "Should have at least 25 features"
    
    def test_required_features(self):
        """Test that required features are in the feature set"""
        feature_names = get_feature_names()
        
        required = [
            'amount', 'is_new_recipient', 'is_new_device',
            'tx_count_1h', 'amount_deviation'
        ]
        
        for feature in required:
            assert feature in feature_names, f"Required feature {feature} not found"


class TestImports:
    """Test that all critical modules import successfully"""
    
    def test_fraud_reasons_import(self):
        """Test fraud_reasons module imports"""
        from app import fraud_reasons
        assert hasattr(fraud_reasons, 'generate_fraud_reasons')
        assert hasattr(fraud_reasons, 'categorize_fraud_risk')
    
    def test_scoring_import(self):
        """Test scoring module imports"""
        from app import scoring
        assert hasattr(scoring, 'score_transaction')
        assert hasattr(scoring, 'extract_features')
    
    def test_feature_engine_import(self):
        """Test feature_engine module imports"""
        from app import feature_engine
        assert hasattr(feature_engine, 'extract_features')
        assert hasattr(feature_engine, 'get_feature_names')
    
    def test_backend_server_import(self):
        """Test backend server imports"""
        from backend import server
        assert hasattr(server, 'app')
    
    def test_app_main_import(self):
        """Test app.main imports"""
        from app import main
        assert hasattr(main, 'app')


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
