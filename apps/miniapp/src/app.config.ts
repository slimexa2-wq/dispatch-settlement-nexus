export default defineAppConfig({
  pages: [
    "pages/demo/index",
    "pages/index/index",
    "pages/login/index",
    "pages/operator/register/index",
    "pages/operator/interviews/index",
    "pages/operator/onboarding/index",
    "pages/operator/offboarding/index",
    "pages/operator/people/index",
    "pages/operator/person-detail/index",
    "pages/jobs/index/index",
    "pages/jobs/detail/index",
    "pages/application/form/index",
    "pages/application/mine/index",
    "pages/supplier/people/index",
    "pages/supplier/metrics/index",
    "pages/supplier/policies/index",
    "pages/referrals/index/index",
    "pages/referrals/mine/index",
    "pages/referrals/rewards/index",
    "pages/salary/index/index",
    "pages/profile/index/index"
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#1268f3",
    navigationBarTitleText: "祥能人事招聘",
    navigationBarTextStyle: "white",
    backgroundColor: "#f3f7ff"
  },
  lazyCodeLoading: "requiredComponents"
});
