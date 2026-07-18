package com.jisong.podoalplanner;

import com.google.firebase.appcheck.AppCheckProviderFactory;
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory;

final class AppCheckProviderFactorySelector {
    private AppCheckProviderFactorySelector() {}

    static AppCheckProviderFactory get() {
        return DebugAppCheckProviderFactory.getInstance();
    }
}
