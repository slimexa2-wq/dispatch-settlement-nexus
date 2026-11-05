import unittest
import time
from typing import List, Dict, Any

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from ultra_modules.shift_overtime_converter_batch_pipeline import ShiftOvertimeConverterBatchPipeline

class TestShiftOvertimeConverterBatchPipeline(unittest.TestCase):
    def setUp(self):
        self.pipeline = ShiftOvertimeConverterBatchPipeline(max_workers=5)

    def tearDown(self):
        self.pipeline.shutdown()

    def test_normal_operation(self):
        """Test Case 1: Normal processing with perfect data"""
        record = {
            'employee_id': 'EMP001',
            'shift_type': 'night',
            'day_type': 'weekend',
            'hours': 8.0,
            'overtime_hours': 2.0
        }
        result = self.pipeline.process_single_record(record)
        self.assertEqual(result['_status'], 'success')
        self.assertEqual(result['employee_id'], 'EMP001')
        self.assertEqual(result['multiplier'], 2.0)
        self.assertEqual(result['converted_overtime_hours'], 4.0)
        self.assertEqual(result['total_equivalent_hours'], 12.0)

    def test_dirty_data_self_healing(self):
        """Test Case 2: Dirty data auto-correction and healing"""
        record = {
            'employee_id': '  ',
            'shift_type': 'INVALID_SHIFT',
            'day_type': '  null  ',
            'hours': 'not_a_number',
            'overtime_hours': '-5.5' # negative hours
        }
        result = self.pipeline.process_single_record(record)
        self.assertEqual(result['_status'], 'success')
        self.assertEqual(result['employee_id'], 'UNKNOWN_EMP')
        self.assertEqual(result['shift_type'], 'day')
        self.assertEqual(result['day_type'], 'normal')
        self.assertEqual(result['original_hours'], 0.0)
        self.assertEqual(result['original_overtime'], 0.0) # negative became 0.0
        self.assertEqual(result['total_equivalent_hours'], 0.0)

    def test_missing_parameters_defaulting(self):
        """Test Case 3: Completely empty/missing parameters default fallback"""
        record = {}
        result = self.pipeline.process_single_record(record)
        self.assertEqual(result['_status'], 'success')
        self.assertEqual(result['employee_id'], 'UNKNOWN_EMP')
        self.assertEqual(result['shift_type'], 'day')
        self.assertEqual(result['day_type'], 'normal')
        self.assertEqual(result['original_hours'], 0.0)
        self.assertEqual(result['original_overtime'], 0.0)
        self.assertEqual(result['multiplier'], 1.5)
        self.assertEqual(result['total_equivalent_hours'], 0.0)

    def test_edge_case_holiday_multiplier(self):
        """Test Case 4: Edge cases with high multipliers and large float parsing"""
        record = {
            'employee_id': 'EMP999',
            'shift_type': 'night',
            'day_type': 'holiday',
            'hours': '8.5',
            'overtime_hours': '4.25'
        }
        result = self.pipeline.process_single_record(record)
        self.assertEqual(result['_status'], 'success')
        self.assertEqual(result['multiplier'], 3.0)
        self.assertEqual(result['converted_overtime_hours'], 12.75)
        self.assertEqual(result['total_equivalent_hours'], 21.25)

    def test_high_volume_batch_processing_and_snapshot(self):
        """Test Case 5: Concurrency, bulk stream processing of 1000 items, and progress snapshot"""
        records = [
            {
                'employee_id': f'EMP_{i}',
                'day_type': 'weekend' if i % 2 == 0 else 'normal',
                'hours': 8,
                'overtime_hours': 2
            } for i in range(1000)
        ]

        # Test asynchronous batch processing
        job_id = self.pipeline.submit_batch(records)

        # Wait a bit to ensure it enters running or completed state
        time.sleep(0.05)

        snapshot = self.pipeline.get_snapshot(job_id)
        self.assertIsNotNone(snapshot)
        self.assertEqual(snapshot['total_records'], 1000)
        self.assertIn(snapshot['status'], ['running', 'completed'])

        # Now wait for it to complete
        while True:
            snap = self.pipeline.get_snapshot(job_id)
            if snap['status'] == 'completed':
                break
            time.sleep(0.1)

        results = self.pipeline.get_results(job_id)
        self.assertIsNotNone(results)
        self.assertEqual(len(results), 1000)

        # Verify a random item to ensure logic ran
        res0 = results[0]
        self.assertEqual(res0['employee_id'], 'EMP_0')
        self.assertEqual(res0['multiplier'], 2.0)
        self.assertEqual(res0['total_equivalent_hours'], 12.0)

        res1 = results[1]
        self.assertEqual(res1['employee_id'], 'EMP_1')
        self.assertEqual(res1['multiplier'], 1.5)
        self.assertEqual(res1['total_equivalent_hours'], 11.0)

if __name__ == '__main__':
    unittest.main()
