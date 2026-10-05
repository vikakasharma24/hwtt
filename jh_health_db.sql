-- ==============================================================================
-- JHARKHAND HEALTH TRAINING PORTAL - MASTER DATABASE SCHEMA
-- ==============================================================================
-- Database: jh_health_db
-- Target Engine: MySQL Server 8.0+ (InnoDB, UTF8mb4)
-- Purpose: Unified primary database schema for high-throughput (500+ workers)
--          with sub-10ms response times and AI adaptive learning triage.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DATABASE CREATION
-- ------------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `jh_health_db` 
    DEFAULT CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

USE `jh_health_db`;

-- ------------------------------------------------------------------------------
-- 2. USERS TABLE (Frontline Health Workers & Administrators)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
    `id` VARCHAR(64) PRIMARY KEY,
    `worker_unique_id` VARCHAR(64) NOT NULL UNIQUE COMMENT 'State Worker ID e.g. JH559304, ADMIN-000001',
    `phone` VARCHAR(15) NOT NULL UNIQUE COMMENT '10-digit mobile number for login',
    `password_hash` VARCHAR(255) NOT NULL COMMENT 'Salted SHA-256 hash',
    `role` ENUM('ADMIN', 'WORKER') NOT NULL DEFAULT 'WORKER',
    `full_name` VARCHAR(128) NOT NULL,
    `designation` VARCHAR(64) NULL COMMENT 'ANM, GNM, CHO, ASHA, MO, Other',
    `facility_name` VARCHAR(128) NULL,
    `facility_type` VARCHAR(64) NULL COMMENT 'HSC, PHC, CHC, DH, Other',
    `city_or_village` VARCHAR(128) NULL,
    `district_id` VARCHAR(32) NULL,
    `district_name` VARCHAR(64) NULL,
    `state` VARCHAR(64) DEFAULT 'Jharkhand',
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX `idx_users_phone` (`phone`),
    INDEX `idx_users_role` (`role`),
    INDEX `idx_users_district` (`district_name`),
    INDEX `idx_users_worker_id` (`worker_unique_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Registered health workers and portal administrators';

-- ------------------------------------------------------------------------------
-- 3. TRAININGS TABLE (Curriculum & Clinical Modules)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `trainings` (
    `id` VARCHAR(64) PRIMARY KEY,
    `category` VARCHAR(64) NOT NULL DEFAULT 'General',
    `status` VARCHAR(32) NOT NULL DEFAULT 'Published',
    `title` VARCHAR(255) NOT NULL,
    `mode` ENUM('physical', 'online', 'hybrid') NOT NULL DEFAULT 'hybrid',
    `venue` VARCHAR(255) NULL,
    `start_at` DATETIME NOT NULL,
    `end_at` DATETIME NOT NULL,
    `attendance_enabled` TINYINT(1) DEFAULT 1,
    `gps_required` TINYINT(1) DEFAULT 0,
    `attendance_open_at` DATETIME NULL,
    `attendance_close_at` DATETIME NULL,
    `assessments_json` LONGTEXT NULL COMMENT 'Serialized JSON of pre and post assessment questions',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX `idx_trainings_status` (`status`),
    INDEX `idx_trainings_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Clinical training programs and schedules';

-- ------------------------------------------------------------------------------
-- 4. ATTENDANCE TABLE (Daily Check-in Telemetry)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `training_id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `worker_unique_id` VARCHAR(64) NOT NULL,
    `full_name` VARCHAR(128) NOT NULL,
    `phone` VARCHAR(15) NOT NULL,
    `designation` VARCHAR(64) NULL,
    `facility_name` VARCHAR(128) NULL,
    `district_name` VARCHAR(64) NULL,
    `status` VARCHAR(32) DEFAULT 'Present',
    `checked_in_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX `idx_att_training` (`training_id`),
    INDEX `idx_att_user` (`user_id`),
    UNIQUE KEY `uq_user_training_att` (`training_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Session attendance logs';

-- ------------------------------------------------------------------------------
-- 5. ATTEMPTS TABLE (Detailed Pre/Post Tests)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attempts` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `training_id` VARCHAR(64) NOT NULL,
    `training_title` VARCHAR(255) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `worker_unique_id` VARCHAR(64) NOT NULL,
    `full_name` VARCHAR(128) NOT NULL,
    `phone` VARCHAR(15) NOT NULL,
    `designation` VARCHAR(64) NULL,
    `facility_name` VARCHAR(128) NULL,
    `district_name` VARCHAR(64) NULL,
    `test_type` ENUM('pre', 'post') NOT NULL,
    `score` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    `total_marks` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    `percent` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `passed` TINYINT(1) NOT NULL DEFAULT 0,
    `answers_json` LONGTEXT NULL,
    `submitted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX `idx_attempts_user` (`user_id`),
    INDEX `idx_attempts_training` (`training_id`),
    INDEX `idx_attempts_test_type` (`test_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Assessment attempts and scores';

-- ------------------------------------------------------------------------------
-- 6. ASSESSMENTS TABLE (Primary Ingestion Stream for AI Engine)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `assessments` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` VARCHAR(64) NOT NULL,
    `module_name` VARCHAR(128) NOT NULL,
    `pre_test_score` DECIMAL(5, 2) DEFAULT 0.00,
    `post_test_score` DECIMAL(5, 2) DEFAULT 0.00,
    `time_spent_seconds` INT DEFAULT 0,
    `percent` DECIMAL(5, 2) DEFAULT 0.00,
    `passed` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX `idx_assessment_user` (`user_id`),
    INDEX `idx_assessment_module` (`module_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Assessment scores for historical failure density calculations';

-- ------------------------------------------------------------------------------
-- 7. AI REMEDIAL RECOMMENDATIONS TABLE (ML Adaptive Learning Triage)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_remedial_recommendations` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` VARCHAR(64) NOT NULL COMMENT 'Frontline health worker ID',
    `module_name` VARCHAR(128) NOT NULL COMMENT 'Clinical training module name',
    `predicted_risk_level` ENUM('High', 'Medium', 'Low') NOT NULL DEFAULT 'Low',
    `recommended_topic_id` VARCHAR(64) NOT NULL,
    `remedial_title` VARCHAR(255) NULL,
    `remedial_video_url` VARCHAR(512) NULL,
    `confidence_score` DECIMAL(5, 4) DEFAULT 0.0000,
    `historical_failure_density` DECIMAL(5, 4) DEFAULT 0.0000,
    `is_resolved` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_user_active_risk` (`user_id`, `is_resolved`, `predicted_risk_level`),
    UNIQUE KEY `uq_user_module` (`user_id`, `module_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI Adaptive Learning recommendations for frontline health workers';

-- ------------------------------------------------------------------------------
-- 8. EVENT AUDIT LOG (Master Audit & Google Sheets Background Sync Queue)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `event_logs` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `event_type` VARCHAR(64) NOT NULL,
    `actor_role` VARCHAR(32) NULL,
    `actor_id` VARCHAR(64) NULL,
    `actor_name` VARCHAR(128) NULL,
    `actor_phone` VARCHAR(15) NULL,
    `worker_unique_id` VARCHAR(64) NULL,
    `full_name` VARCHAR(128) NULL,
    `designation` VARCHAR(64) NULL,
    `facility_name` VARCHAR(128) NULL,
    `facility_type` VARCHAR(64) NULL,
    `city_or_village` VARCHAR(128) NULL,
    `district` VARCHAR(64) NULL,
    `payload_json` JSON NULL,
    `synced_to_sheets` TINYINT(1) DEFAULT 0,
    `synced_at` DATETIME NULL,

    INDEX `idx_event_type` (`event_type`),
    INDEX `idx_event_worker` (`worker_unique_id`),
    INDEX `idx_event_sync` (`synced_to_sheets`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit trail and async Google Sheets sync queue';

-- ------------------------------------------------------------------------------
-- 9. INITIAL SEED DATA (Admin, Frontline Health Workers & Core Trainings)
-- ------------------------------------------------------------------------------
-- Default Passwords:
-- Admin: Admin@123 (Hash: 4311d0246a19ce40a753e72109162eb05e23cc30f50bce584e3e2ed1123caed0)
-- Workers: Password reset required on first login via portal verification

INSERT INTO `users` 
    (`id`, `worker_unique_id`, `phone`, `password_hash`, `role`, `full_name`,
     `designation`, `facility_name`, `facility_type`, `city_or_village`,
     `district_id`, `district_name`, `state`)
VALUES
    ('0015fc58-c17d-4155-94ee-9226d9c6696b', 'ADMIN-000001', '9999999999', '4311d0246a19ce40a753e72109162eb05e23cc30f50bce584e3e2ed1123caed0', 'ADMIN', 'State Admin', 'State Health Administrator', 'NHM HQ', 'State HQ', 'Ranchi', 'D-20', 'Ranchi', 'Jharkhand'),
    ('88f24edb-0a68-450e-a4fe-d54625b34da5', 'JH559304', '7004369523', 'PASSWORD_RESET_REQUIRED', 'WORKER', 'Vikash Sharma', 'ANM', 'ratu', 'Other', 'ratu', 'D-20', 'Ranchi', 'Jharkhand')
ON DUPLICATE KEY UPDATE 
    full_name = VALUES(full_name),
    designation = VALUES(designation),
    facility_name = VALUES(facility_name);

INSERT INTO `trainings` 
    (`id`, `category`, `status`, `title`, `mode`, `venue`, `start_at`, `end_at`, 
     `attendance_enabled`, `gps_required`, `attendance_open_at`, `attendance_close_at`)
VALUES
    ('T-TB-001', 'TB', 'Published', 'National Tuberculosis Elimination Program (NTEP) Refresher', 'hybrid', 'State Health Training Centre, Ranchi / Online', '2026-03-01 09:00:00', '2026-12-31 18:00:00', 1, 0, '2026-03-01 08:00:00', '2026-12-31 19:00:00'),
    ('T-MCH-002', 'Maternal Health', 'Published', 'Comprehensive Maternal & Newborn Health Care Protocols', 'physical', 'District Hospital Conference Hall', '2026-03-01 09:00:00', '2026-12-31 18:00:00', 1, 0, '2026-03-01 08:00:00', '2026-12-31 19:00:00'),
    ('T-IMNCI-003', 'Child Nutrition', 'Published', 'e-IMNCI Protocol: Severe Acute Malnutrition (SAM) Identification', 'online', 'State Tele-Health Training Portal', '2026-03-01 09:00:00', '2026-12-31 18:00:00', 1, 0, '2026-03-01 08:00:00', '2026-12-31 19:00:00'),
    ('T-UIP-004', 'Immunization', 'Published', 'Universal Immunization: Vaccine Cold Chain & Anaphylaxis Preparedness', 'hybrid', 'Ranchi Medical College Auditorium', '2026-03-01 09:00:00', '2026-12-31 18:00:00', 1, 0, '2026-03-01 08:00:00', '2026-12-31 19:00:00')
ON DUPLICATE KEY UPDATE 
    title = VALUES(title),
    venue = VALUES(venue);

-- ------------------------------------------------------------------------------
-- 10. VERIFICATION
-- ------------------------------------------------------------------------------
SHOW TABLES FROM `jh_health_db`;
