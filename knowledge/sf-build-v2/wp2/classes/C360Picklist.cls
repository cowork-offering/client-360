/**
 * C360Picklist - reads picklist values from the org, never from a literal in the app.
 *
 * A33.1.6: "Picklist options are read from the org, never hardcoded in the app." WP1 criterion 3
 * turns the same rule on the service-request tool: it must read Type and Origin from the org so
 * its degraded-mode branch becomes unreachable in bankinggpt while remaining valid for an org
 * that has not deployed those values.
 *
 * A33.1.6 also records the limit of this check: several fields in this org are restricted = false
 * and carry live values absent from the picklist (Loan Status holds 'Superseded'). So this class
 * answers "does the org offer this value", which is what a tool needs to decide between the real
 * value and a declared fallback. It is not a claim that an absent value would be rejected on write.
 */
public with sharing class C360Picklist {

    private static final Map<String, Set<String>> CACHE = new Map<String, Set<String>>();

    /**
     * Active picklist values for a field, read live from the describe.
     *
     * @param objectApiName The object API name.
     * @param fieldApiName The picklist field API name.
     * @return The active values. Empty when the field is absent or is not a picklist.
     */
    public static Set<String> activeValues(String objectApiName, String fieldApiName) {
        String key = objectApiName + '.' + fieldApiName;
        if (CACHE.containsKey(key)) {
            return CACHE.get(key);
        }

        Set<String> values = new Set<String>();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApiName);
        if (t != null) {
            Schema.SObjectField f = t.getDescribe().fields.getMap().get(fieldApiName);
            if (f != null) {
                Schema.DescribeFieldResult d = f.getDescribe();
                if (d.getType() == Schema.DisplayType.PICKLIST) {
                    for (Schema.PicklistEntry pe : d.getPicklistValues()) {
                        if (pe.isActive()) {
                            values.add(pe.getValue());
                        }
                    }
                }
            }
        }
        CACHE.put(key, values);
        return values;
    }

    /**
     * Picks the intended value when the org offers it, otherwise the declared fallback.
     * The caller is responsible for surfacing the substitution in the confirm summary: the
     * degraded path is declared to the banker, never hidden (A33.4.8(b)).
     *
     * @param objectApiName The object API name.
     * @param fieldApiName The picklist field API name.
     * @param preferred The honest value the action wants.
     * @param fallback The probe-proven value to use when the preferred value is not deployed.
     * @return The value to write.
     */
    public static String preferredOrFallback(String objectApiName, String fieldApiName, String preferred, String fallback) {
        return activeValues(objectApiName, fieldApiName).contains(preferred) ? preferred : fallback;
    }
}
