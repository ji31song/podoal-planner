package com.jisong.podoalplanner;

import com.google.firebase.appcheck.AppCheckProviderFactory;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;

final class AppCheckProviderFactorySelector {
    private AppCheckProviderFactorySelector() {}

    static AppCheckProviderFactory get() {
        return PlayIntegrityAppCheckProviderFactory.getInstance();
    }
}
