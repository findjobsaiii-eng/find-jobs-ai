/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authEnvironment from "../authEnvironment.js";
import type * as candidateProfiles from "../candidateProfiles.js";
import type * as http from "../http.js";
import type * as jobDiscovery from "../jobDiscovery.js";
import type * as jobDiscoveryActions from "../jobDiscoveryActions.js";
import type * as jobDiscoveryModel from "../jobDiscoveryModel.js";
import type * as jobQuality from "../jobQuality.js";
import type * as jobSearchPolicy from "../jobSearchPolicy.js";
import type * as jobSearchRuntimeConfig from "../jobSearchRuntimeConfig.js";
import type * as jobSourceVerification from "../jobSourceVerification.js";
import type * as openAIJobProvider from "../openAIJobProvider.js";
import type * as referenceCatalogData from "../referenceCatalogData.js";
import type * as referenceData from "../referenceData.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authEnvironment: typeof authEnvironment;
  candidateProfiles: typeof candidateProfiles;
  http: typeof http;
  jobDiscovery: typeof jobDiscovery;
  jobDiscoveryActions: typeof jobDiscoveryActions;
  jobDiscoveryModel: typeof jobDiscoveryModel;
  jobQuality: typeof jobQuality;
  jobSearchPolicy: typeof jobSearchPolicy;
  jobSearchRuntimeConfig: typeof jobSearchRuntimeConfig;
  jobSourceVerification: typeof jobSourceVerification;
  openAIJobProvider: typeof openAIJobProvider;
  referenceCatalogData: typeof referenceCatalogData;
  referenceData: typeof referenceData;
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
