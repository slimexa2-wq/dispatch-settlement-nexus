import unittest
from ultra_modules.supplier_invoice_vat_checker_core_engine import calculate_supplier_vat_deduction

class TestSupplierInvoiceVATCheckerCoreEngine(unittest.TestCase):

    def test_normal_execution_6_percent_special(self):
        """测试用例1：正常执行，6%专票。测试常规输入能否计算出正确的税额和抵扣额"""
        res = calculate_supplier_vat_deduction(
            invoice_type="专票",
            amount=106.0,
            tax_rate=6.0,
            differential_deduction=0.0
        )
        self.assertEqual(res["invoice_type"], "专票")
        self.assertEqual(res["tax_rate_pct"], 6.0)
        self.assertEqual(res["amount_inclusive"], 106.0)
        self.assertEqual(res["tax_amount"], 6.0)
        self.assertEqual(res["deductible_vat"], 6.0)
        self.assertEqual(res["amount_exclusive"], 100.0)

    def test_dirty_data_auto_healing(self):
        """测试用例2：脏数据自愈。测试非数字字符串、带字符的字符串等能被静默清洗"""
        res = calculate_supplier_vat_deduction(
            invoice_type=" 普 票 ",
            amount=" 103块钱 ",
            tax_rate="3.0%",
            differential_deduction="xyz"
        )
        self.assertEqual(res["invoice_type"], "普票")
        self.assertEqual(res["tax_rate_pct"], 3.0)
        self.assertEqual(res["amount_inclusive"], 103.0)
        self.assertEqual(res["tax_amount"], 3.0)
        self.assertEqual(res["deductible_vat"], 0.0) # 普票不可抵扣
        self.assertEqual(res["differential_deduction"], 0.0)

    def test_missing_parameter_defaults(self):
        """测试用例3：缺参默认兜底。测试空参数、None等情况下的默认行为"""
        res = calculate_supplier_vat_deduction()
        # 默认专票、金额0.0、税率6.0
        self.assertEqual(res["invoice_type"], "专票")
        self.assertEqual(res["tax_rate_pct"], 6.0)
        self.assertEqual(res["amount_inclusive"], 0.0)
        self.assertEqual(res["tax_amount"], 0.0)
        self.assertEqual(res["deductible_vat"], 0.0)

    def test_extreme_boundaries(self):
        """测试用例4：极端边界。测试负数金额、负数差额扣除、差额大于金额等情况"""
        res = calculate_supplier_vat_deduction(
            invoice_type="普通发票",
            amount=-100.0,  # 负数金额将被归零
            tax_rate=0.06,  # 小数形式将被转为百分比6.0
            differential_deduction=-50.0 # 负数差额将被归零
        )
        self.assertEqual(res["amount_inclusive"], 0.0)
        self.assertEqual(res["tax_rate_pct"], 6.0)
        self.assertEqual(res["differential_deduction"], 0.0)

        # 差额大于金额的情况（且为5%税率，触发差额扣除逻辑）
        res2 = calculate_supplier_vat_deduction(
            invoice_type="专票",
            amount=100.0,
            tax_rate=5.0,
            differential_deduction=150.0  # 差额大于金额将被归零
        )
        self.assertEqual(res2["amount_inclusive"], 100.0)
        self.assertEqual(res2["differential_deduction"], 0.0)
        self.assertEqual(res2["tax_rate_pct"], 5.0)
        # 不扣除差额，计算：100 / 1.05 * 0.05 ≈ 4.76
        self.assertEqual(res2["tax_amount"], 4.76)

    def test_tax_rate_snapping_and_differential_deduction(self):
        """测试用例5：税率静默修正和差额扣除5%正常逻辑。非法税率将被修正为最接近的合规税率"""
        res = calculate_supplier_vat_deduction(
            invoice_type="专票",
            amount=105.0,
            tax_rate=4.8, # 非法，最接近的是5.0
            differential_deduction=21.0
        )
        self.assertEqual(res["tax_rate_pct"], 5.0)
        self.assertEqual(res["differential_deduction"], 21.0)
        # (105 - 21) = 84
        # 84 / 1.05 * 0.05 = 4.0
        self.assertEqual(res["tax_amount"], 4.0)
        self.assertEqual(res["deductible_vat"], 4.0)
        self.assertEqual(res["amount_exclusive"], 101.0) # 105 - 4

if __name__ == '__main__':
    unittest.main()
