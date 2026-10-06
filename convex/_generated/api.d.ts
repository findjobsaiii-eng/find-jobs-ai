/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountData from "../accountData.js";
import type * as admin from "../admin.js";
import type * as adminMetrics from "../adminMetrics.js";
import type * as adminMetricsModel from "../adminMetricsModel.js";
import type * as adminUserSearch from "../adminUserSearch.js";
import type * as aiUsage from "../aiUsage.js";
import type * as aiUsageModel from "../aiUsageModel.js";
import type * as auth from "../auth.js";
import type * as authEnvironment from "../authEnvironment.js";
import type * as candidateProfiles from "../candidateProfiles.js";
import type * as candidateQualifications from "../candidateQualifications.js";
import type * as catalogReconciliation from "../catalogReconciliation.js";
import type * as companySourceMemory from "../companySourceMemory.js";
import type * as crons from "../crons.js";
import type * as dailyDiscovery from "../dailyDiscovery.js";
import type * as educationCatalogData from "../educationCatalogData.js";
import type * as educationIdentity from "../educationIdentity.js";
import type * as emailDeliveryEvents from "../emailDeliveryEvents.js";
import type * as emailPreferences from "../emailPreferences.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as jobActivity from "../jobActivity.js";
import type * as jobActivityActions from "../jobActivityActions.js";
import type * as jobActivityPolicy from "../jobActivityPolicy.js";
import type * as jobDiscovery from "../jobDiscovery.js";
import type * as jobDiscoveryActions from "../jobDiscoveryActions.js";
import type * as jobDiscoveryModel from "../jobDiscoveryModel.js";
import type * as jobEmailActions from "../jobEmailActions.js";
import type * as jobEmailTemplate from "../jobEmailTemplate.js";
import type * as jobEmailUrl from "../jobEmailUrl.js";
import type * as jobFreshness from "../jobFreshness.js";
import type * as jobGeography from "../jobGeography.js";
import type * as jobGeographyData from "../jobGeographyData.js";
import type * as jobMatching from "../jobMatching.js";
import type * as jobQuality from "../jobQuality.js";
import type * as jobRequirementActions from "../jobRequirementActions.js";
import type * as jobRequirementEvidence from "../jobRequirementEvidence.js";
import type * as jobRequirements from "../jobRequirements.js";
import type * as jobReviewActions from "../jobReviewActions.js";
import type * as jobReviewModel from "../jobReviewModel.js";
import type * as jobReviews from "../jobReviews.js";
import type * as jobSearchPolicy from "../jobSearchPolicy.js";
import type * as jobSearchRuntimeConfig from "../jobSearchRuntimeConfig.js";
import type * as jobSourceProvenance from "../jobSourceProvenance.js";
import type * as jobSourceQuality from "../jobSourceQuality.js";
import type * as jobSourceVerification from "../jobSourceVerification.js";
import type * as legalConsents from "../legalConsents.js";
import type * as onboardingReminderActions from "../onboardingReminderActions.js";
import type * as onboardingReminderTemplate from "../onboardingReminderTemplate.js";
import type * as onboardingReminderUnsubscribe from "../onboardingReminderUnsubscribe.js";
import type * as onboardingReminders from "../onboardingReminders.js";
import type * as openAIJobProvider from "../openAIJobProvider.js";
import type * as productAnalytics from "../productAnalytics.js";
import type * as referenceCatalogData from "../referenceCatalogData.js";
import type * as referenceData from "../referenceData.js";
import type * as referenceIdentity from "../referenceIdentity.js";
import type * as referenceIdentityActions from "../referenceIdentityActions.js";
import type * as referenceIdentityModel from "../referenceIdentityModel.js";
import type * as resendWebhook from "../resendWebhook.js";
import type * as resumeActions from "../resumeActions.js";
import type * as resumeProfileModel from "../resumeProfileModel.js";
import type * as resumes from "../resumes.js";
import type * as skillIdentity from "../skillIdentity.js";
import type * as sourceYieldAudit from "../sourceYieldAudit.js";
import type * as telemetry from "../telemetry.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountData: typeof accountData;
  admin: typeof admin;
  adminMetrics: typeof adminMetrics;
  adminMetricsModel: typeof adminMetricsModel;
  adminUserSearch: typeof adminUserSearch;
  aiUsage: typeof aiUsage;
  aiUsageModel: typeof aiUsageModel;
  auth: typeof auth;
  authEnvironment: typeof authEnvironment;
  candidateProfiles: typeof candidateProfiles;
  candidateQualifications: typeof candidateQualifications;
  catalogReconciliation: typeof catalogReconciliation;
  companySourceMemory: typeof companySourceMemory;
  crons: typeof crons;
  dailyDiscovery: typeof dailyDiscovery;
  educationCatalogData: typeof educationCatalogData;
  educationIdentity: typeof educationIdentity;
  emailDeliveryEvents: typeof emailDeliveryEvents;
  emailPreferences: typeof emailPreferences;
  health: typeof health;
  http: typeof http;
  jobActivity: typeof jobActivity;
  jobActivityActions: typeof jobActivityActions;
  jobActivityPolicy: typeof jobActivityPolicy;
  jobDiscovery: typeof jobDiscovery;
  jobDiscoveryActions: typeof jobDiscoveryActions;
  jobDiscoveryModel: typeof jobDiscoveryModel;
  jobEmailActions: typeof jobEmailActions;
  jobEmailTemplate: typeof jobEmailTemplate;
  jobEmailUrl: typeof jobEmailUrl;
  jobFreshness: typeof jobFreshness;
  jobGeography: typeof jobGeography;
  jobGeographyData: typeof jobGeographyData;
  jobMatching: typeof jobMatching;
  jobQuality: typeof jobQuality;
  jobRequirementActions: typeof jobRequirementActions;
  jobRequirementEvidence: typeof jobRequirementEvidence;
  jobRequirements: typeof jobRequirements;
  jobReviewActions: typeof jobReviewActions;
  jobReviewModel: typeof jobReviewModel;
  jobReviews: typeof jobReviews;
  jobSearchPolicy: typeof jobSearchPolicy;
  jobSearchRuntimeConfig: typeof jobSearchRuntimeConfig;
  jobSourceProvenance: typeof jobSourceProvenance;
  jobSourceQuality: typeof jobSourceQuality;
  jobSourceVerification: typeof jobSourceVerification;
  legalConsents: typeof legalConsents;
  onboardingReminderActions: typeof onboardingReminderActions;
  onboardingReminderTemplate: typeof onboardingReminderTemplate;
  onboardingReminderUnsubscribe: typeof onboardingReminderUnsubscribe;
  onboardingReminders: typeof onboardingReminders;
  openAIJobProvider: typeof openAIJobProvider;
  productAnalytics: typeof productAnalytics;
  referenceCatalogData: typeof referenceCatalogData;
  referenceData: typeof referenceData;
  referenceIdentity: typeof referenceIdentity;
  referenceIdentityActions: typeof referenceIdentityActions;
  referenceIdentityModel: typeof referenceIdentityModel;
  resendWebhook: typeof resendWebhook;
  resumeActions: typeof resumeActions;
  resumeProfileModel: typeof resumeProfileModel;
  resumes: typeof resumes;
  skillIdentity: typeof skillIdentity;
  sourceYieldAudit: typeof sourceYieldAudit;
  telemetry: typeof telemetry;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
