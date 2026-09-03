/** Types for `two-package-fixture.mjs`, so the vitest suite can import the SAME
 *  module the Playwright probe assembles its artifact from. One fixture, two
 *  readers: the shot on the glass and the assertion in the suite stand on the
 *  same bytes. */
export declare const ACCOUNT_ID: string;
export declare const PACKAGE_ONE: string;
export declare const PACKAGE_TWO: string;
export declare const FACILITY_TWO: string;
export declare function withSecondPackage<T>(data: T): T;
export declare function twoPackageData(): unknown;
