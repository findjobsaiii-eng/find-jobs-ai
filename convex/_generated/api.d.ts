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
import type * as auth from "../auth.js";
import type * as authEnvironment from "../authEnvironment.js";
import type * as candidateProfiles from "../candidateProfiles.js";
import type * as companySourceMemory from "../companySourceMemory.js";
import type * as crons from "../crons.js";
import type * as dailyDiscovery from "../dailyDiscovery.js";
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
import type * as jobReviewActions from "../jobReviewActions.js";
import type * as jobReviewModel from "../jobReviewModel.js";
import type * as jobReviews from "../jobReviews.js";
import type * as jobSearchPolicy from "../jobSearchPolicy.js";
import type * as jobSearchRuntimeConfig from "../jobSearchRuntimeConfig.js";
import type * as jobSourceProvenance from "../jobSourceProvenance.js";
import type * as jobSourceQuality from "../jobSourceQuality.js";
import type * as jobSourceVerification from "../jobSourceVerification.js";
import type * as legalConsents from "../legalConsents.js";
import type * as openAIJobProvider from "../openAIJobProvider.js";
import type * as referenceCatalogData from "../referenceCatalogData.js";
import type * as referenceData from "../referenceData.js";
import type * as resumeActions from "../resumeActions.js";
import type * as resumeProfileModel from "../resumeProfileModel.js";
import type * as resumes from "../resumes.js";
import type * as sourceYieldAudit from "../sourceYieldAudit.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountData: typeof accountData;
  admin: typeof admin;
  auth: typeof auth;
  authEnvironment: typeof authEnvironment;
  candidateProfiles: typeof candidateProfiles;
  companySourceMemory: typeof companySourceMemory;
  crons: typeof crons;
  dailyDiscovery: typeof dailyDiscovery;
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
  jobReviewActions: typeof jobReviewActions;
  jobReviewModel: typeof jobReviewModel;
  jobReviews: typeof jobReviews;
  jobSearchPolicy: typeof jobSearchPolicy;
  jobSearchRuntimeConfig: typeof jobSearchRuntimeConfig;
  jobSourceProvenance: typeof jobSourceProvenance;
  jobSourceQuality: typeof jobSourceQuality;
  jobSourceVerification: typeof jobSourceVerification;
  legalConsents: typeof legalConsents;
  openAIJobProvider: typeof openAIJobProvider;
  referenceCatalogData: typeof referenceCatalogData;
  referenceData: typeof referenceData;
  resumeActions: typeof resumeActions;
  resumeProfileModel: typeof resumeProfileModel;
  resumes: typeof resumes;
  sourceYieldAudit: typeof sourceYieldAudit;
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
