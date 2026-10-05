"""
==============================================================================
AI Adaptive Learning Engine (ai_engine.py)
------------------------------------------------------------------------------
Lightweight Python Machine Learning framework using Scikit-Learn with
resilient deterministic fallback for frontline health worker performance triage.
==============================================================================
"""

import os
import logging
from typing import Tuple, Dict, Any

# Configure structured logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AI_ENGINE")

# Clinical Remedial Video and Knowledge Base Catalog
REMEDIAL_CATALOG: Dict[str, Dict[str, str]] = {
    "e-IMNCI Child Nutrition": {
        "topic_id": "TOPIC-IMNCI-NUT-01",
        "title": "e-IMNCI Protocol: Severe Acute Malnutrition (SAM) Identification & Triage",
        "video_url": "https://assets.nhm.gov.in/training/imnci_sam_nutrition_refresher.mp4"
    },
    "TB Case Management": {
        "topic_id": "TOPIC-TB-DOTS-02",
        "title": "Molecular Diagnostic Triage: CBNAAT/TrueNat & Adherence Protocol",
        "video_url": "https://assets.nhm.gov.in/training/tb_truenat_dots_refresher.mp4"
    },
    "Maternal Health": {
        "topic_id": "TOPIC-MH-PPH-03",
        "title": "Emergency Obstetric Protocol: Active Management of PPH & Oxytocin Use",
        "video_url": "https://assets.nhm.gov.in/training/maternal_health_pph_emergency.mp4"
    },
    "Immunization": {
        "topic_id": "TOPIC-UIP-COLD-04",
        "title": "Universal Immunization: Vaccine Cold Chain & Anaphylaxis Preparedness",
        "video_url": "https://assets.nhm.gov.in/training/uip_cold_chain_management.mp4"
    },
    "Child Health": {
        "topic_id": "TOPIC-CH-PNEUMONIA-05",
        "title": "Pediatric Respiratory Distress & Fast Breathing Assessment Protocol",
        "video_url": "https://assets.nhm.gov.in/training/pediatric_respiratory_care.mp4"
    },
    "Default": {
        "topic_id": "TOPIC-GEN-CLINICAL-00",
        "title": "Standard Frontline Clinical Guidelines Refresher Course",
        "video_url": "https://assets.nhm.gov.in/training/general_clinical_refresher.mp4"
    }
}


class AdaptiveLearningEngine:
    """
    Evaluates assessment telemetry and historical failure density to classify
    clinical risk levels using Scikit-Learn with zero-downtime rule-based fallback.
    """

    def __init__(self):
        self.model = None
        self.is_sklearn_active = False
        self._init_classifier()

    def _init_classifier(self) -> None:
        """
        Attempts to import scikit-learn and fit an optimized, calibrated
        Decision Tree classifier for knowledge gap risk classification.
        """
        try:
            import numpy as np
            from sklearn.tree import DecisionTreeClassifier

            # Standardized calibration feature matrix:
            # [pre_test_score, post_test_score, score_delta, time_spent_seconds, failure_density]
            X_calibration = np.array([
                # Archetype: High Risk (Failed post-test, negative learning delta, chronic struggle)
                [30.0, 40.0,  10.0, 120, 0.75],
                [45.0, 40.0,  -5.0, 180, 0.80],
                [50.0, 52.0,   2.0, 150, 0.65],
                [60.0, 55.0,  -5.0,  90, 0.50],
                [20.0, 48.0,  28.0, 200, 0.70],

                # Archetype: Medium Risk (Marginal pass, low delta, moderate past failure)
                [50.0, 65.0,  15.0, 320, 0.35],
                [55.0, 68.0,  13.0, 290, 0.30],
                [45.0, 62.0,  17.0, 310, 0.40],
                [62.0, 70.0,   8.0, 260, 0.25],
                [60.0, 72.0,  12.0, 280, 0.20],

                # Archetype: Low Risk (High score, positive delta, low failure density)
                [50.0, 85.0,  35.0, 450, 0.10],
                [65.0, 92.0,  27.0, 400, 0.05],
                [75.0, 95.0,  20.0, 520, 0.00],
                [80.0, 100.0, 20.0, 480, 0.00],
                [70.0, 88.0,  18.0, 390, 0.05],
            ], dtype=float)

            # Labels: 0 = Low Risk, 1 = Medium Risk, 2 = High Risk
            y_calibration = np.array([
                2, 2, 2, 2, 2,  # High
                1, 1, 1, 1, 1,  # Medium
                0, 0, 0, 0, 0   # Low
            ], dtype=int)

            clf = DecisionTreeClassifier(
                criterion="entropy",
                max_depth=4,
                min_samples_split=2,
                random_state=42
            )
            clf.fit(X_calibration, y_calibration)

            self.model = clf
            self.is_sklearn_active = True
            logger.info("AdaptiveLearningEngine: Scikit-learn DecisionTreeClassifier successfully initialized.")

        except ImportError:
            logger.warning("Scikit-learn or numpy not installed. Engine operating in deterministic rule-based mode.")
            self.model = None
            self.is_sklearn_active = False
        except Exception as exc:
            logger.warning("Failed to initialize Scikit-learn model (%s). Engine operating in rule-based mode.", exc)
            self.model = None
            self.is_sklearn_active = False

    def evaluate_risk(
        self,
        pre_test_score: float,
        post_test_score: float,
        time_spent_seconds: int,
        historical_failure_density: float
    ) -> Tuple[str, float]:
        """
        Infers knowledge gap risk level for a health worker.
        Returns:
            Tuple of (predicted_risk_level: str, confidence_score: float)
            where predicted_risk_level is 'High', 'Medium', or 'Low'.
        """
        score_delta = float(post_test_score - pre_test_score)
        pre = float(pre_test_score)
        post = float(post_test_score)
        time_spent = float(time_spent_seconds)
        failure_density = float(historical_failure_density)

        # Primary Path: Scikit-Learn Inference with defensive wrapper
        if self.is_sklearn_active and self.model is not None:
            try:
                import numpy as np
                features = np.array([[pre, post, score_delta, time_spent, failure_density]], dtype=float)
                pred_class = int(self.model.predict(features)[0])
                probabilities = self.model.predict_proba(features)[0]
                confidence = float(np.max(probabilities))

                class_map = {0: "Low", 1: "Medium", 2: "High"}
                predicted_risk = class_map.get(pred_class, "Medium")

                # Sanity assertion: post-test strictly below 60% must always flag High or Medium
                if post < 60.0 and predicted_risk == "Low":
                    predicted_risk = "High"
                    confidence = 0.95

                return predicted_risk, confidence

            except Exception as ml_err:
                logger.error("Scikit-learn inference encountered an exception (%s). Falling back gracefully.", ml_err)

        # Fallback Path: Domain Rule Engine
        return self._rule_based_fallback(pre, post, score_delta, failure_density)

    def _rule_based_fallback(
        self,
        pre_score: float,
        post_score: float,
        score_delta: float,
        failure_density: float
    ) -> Tuple[str, float]:
        """
        Deterministic, clinical expert rule fallback guaranteeing zero runtime crashes.
        """
        if post_score < 60.0:
            # Did not pass minimum mastery threshold
            return "High", 0.98
        elif score_delta <= 0.0 and post_score < 75.0:
            # Negative or stagnant progress
            return "High", 0.90
        elif failure_density >= 0.50:
            # Chronic struggle history
            return "High", 0.92
        elif 60.0 <= post_score < 75.0 or (score_delta < 10.0 and post_score < 80.0):
            # Marginal pass
            return "Medium", 0.85
        else:
            # Verified clinical competence
            return "Low", 0.90

    def get_remedial_metadata(self, module_name: str) -> Dict[str, str]:
        """
        Resolves the appropriate remedial topic, title, and video tutorial URL.
        """
        for key, val in REMEDIAL_CATALOG.items():
            if key.lower() in module_name.lower():
                return val
        return REMEDIAL_CATALOG.get(module_name, REMEDIAL_CATALOG["Default"])


# Global thread-safe singleton
ai_engine = AdaptiveLearningEngine()
